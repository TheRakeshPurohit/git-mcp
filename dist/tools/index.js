import { z } from "zod";
import { getCachedFilePath, cacheFilePath } from "../utils/upstash.js";
import { searchDocumentation, storeDocumentationVectors, } from "../utils/vectorStore.js";
// Helper: fetch a file from a URL.
async function fetchFile(url) {
    try {
        const response = await fetch(url);
        return response.ok ? await response.text() : null;
    }
    catch {
        return null;
    }
}
/**
 * Fetch file content from a specific path in a GitHub repository
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - Branch name (main, master)
 * @param path - File path within the repository
 * @returns File content or null if not found
 */
async function fetchFileFromGitHub(owner, repo, branch, path) {
    return await fetchFile(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
}
// Helper: search for a file in a GitHub repository using the GitHub Search API
async function searchGitHubRepo(owner, repo, filename) {
    try {
        // First check the cache
        const cachedPath = await getCachedFilePath(owner, repo, filename);
        if (cachedPath) {
            const content = await fetchFileFromGitHub(owner, repo, cachedPath.branch, cachedPath.path);
            if (content) {
                console.log(`Cache hit for ${filename} in ${owner}/${repo}`);
                return content;
            }
            else {
                console.log(`Cache hit but file not found anymore for ${filename} in ${owner}/${repo}`);
            }
        }
        // If not in cache or cached path didn't work, use GitHub Search API
        const searchUrl = `https://api.github.com/search/code?q=filename:${filename}+repo:${owner}/${repo}`;
        const response = await fetch(searchUrl, {
            headers: {
                Accept: "application/vnd.github.v3+json",
                // Add GitHub token as environment variable if rate limits become an issue
                ...(process.env.GITHUB_TOKEN
                    ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
                    : {}),
            },
        });
        if (!response.ok) {
            console.warn(`GitHub API search failed: ${response.status} ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        // Check if we found any matches
        if (data.total_count === 0 || !data.items || data.items.length === 0) {
            return null;
        }
        // Get the first matching file's path
        const filePath = data.items[0].path;
        // Try fetching from both main and master branches in parallel
        const [mainContent, masterContent] = await Promise.all([
            fetchFileFromGitHub(owner, repo, "main", filePath),
            fetchFileFromGitHub(owner, repo, "master", filePath),
        ]);
        // Cache the successful path
        if (mainContent) {
            await cacheFilePath(owner, repo, filename, filePath, "main");
            return mainContent;
        }
        else if (masterContent) {
            await cacheFilePath(owner, repo, filename, filePath, "master");
            return masterContent;
        }
        return null;
    }
    catch (error) {
        console.error(`Error searching GitHub repo ${owner}/${repo} for ${filename}:`, error);
        return null;
    }
}
export function registerTools(mcp, requestHost, requestUrl) {
    // Generate a dynamic description based on the URL
    const description = generateToolDescription(requestHost, requestUrl);
    const toolName = generateToolName(requestHost, requestUrl);
    const searchToolName = generateSearchToolName(requestHost, requestUrl);
    const searchDescription = generateSearchToolDescription(requestHost, requestUrl);
    // Register fetch documentation tool
    mcp.tool(toolName, description, {}, async () => fetchDocumentation({ requestHost, requestUrl }));
    // Register search documentation tool
    mcp.tool(searchToolName, searchDescription, {
        query: z
            .string()
            .describe("The search query to find relevant documentation"),
    }, async ({ query }) => searchRepositoryDocumentation({ requestHost, requestUrl, query }));
}
export function registerStdioTools(mcp) {
    mcp.tool("fetch_documentation", "Fetch documentation for a repository (URL will be provided when called).", {
        requestUrl: z.string(),
    }, async ({ requestUrl }) => {
        const requestHost = new URL(requestUrl).host;
        // Generate dynamic description after the URL is provided
        const description = generateToolDescription(requestHost, requestUrl);
        console.log(`Using tool description: ${description}`);
        return fetchDocumentation({
            requestHost,
            requestUrl,
        });
    });
    mcp.tool("search_documentation", "Search documentation for a repository (URL will be provided when called).", {
        requestUrl: z.string(),
        query: z
            .string()
            .describe("The search query to find relevant documentation"),
    }, async ({ requestUrl, query }) => {
        const requestHost = new URL(requestUrl).host;
        // Generate dynamic description after the URL is provided
        const searchDescription = generateSearchToolDescription(requestHost, requestUrl);
        console.log(`Using search tool description: ${searchDescription}`);
        return searchRepositoryDocumentation({
            requestHost,
            requestUrl,
            query,
        });
    });
}
function getRepoData(requestHost, requestUrl) {
    // Parse the URL if provided
    const url = requestUrl
        ? new URL(`http://${requestHost}${requestUrl}`)
        : new URL(`http://${requestHost}`);
    const path = url.pathname.split("/").filter(Boolean).join("/");
    // Check for subdomain pattern: {subdomain}.gitmcp.io/{path}
    if (requestHost.includes(".gitmcp.io")) {
        const subdomain = requestHost.split(".")[0];
        return { subdomain, path };
    }
    // Check for github repo pattern: gitmcp.io/{owner}/{repo} or git-mcp.vercel.app/{owner}/{repo}
    else if (requestHost === "gitmcp.io" ||
        requestHost === "git-mcp.vercel.app") {
        // Extract owner/repo from path
        const [owner, repo] = path.split("/");
        if (owner && repo) {
            return { owner, repo };
        }
    }
    return {};
}
/**
 * Generate a dynamic search tool name for the search_documentation tool based on the URL
 * @param requestHost - The host from the request
 * @param requestUrl - The full request URL (optional)
 * @returns A descriptive string for the tool name
 */
function generateSearchToolName(requestHost, requestUrl) {
    try {
        console.log("Generating search tool name for host:", requestUrl);
        // Default tool name as fallback
        let toolName = "search_documentation";
        const { subdomain, path, owner, repo } = getRepoData(requestHost, requestUrl);
        if (subdomain && path) {
            toolName = `search_${subdomain}_${path}_documentation`;
        }
        else if (owner && repo) {
            toolName = `search_${owner}_${repo}_documentation`;
        }
        // replace non-alphanumeric characters with underscores
        return toolName.replace(/[^a-zA-Z0-9]/g, "_");
    }
    catch (error) {
        console.error("Error generating search tool name:", error);
        // Return default tool name if there's any error parsing the URL
        return "search_documentation";
    }
}
/**
 * Generate a dynamic description for the search_documentation tool based on the URL
 * @param requestHost - The host from the request
 * @param requestUrl - The full request URL (optional)
 * @returns A descriptive string for the tool
 */
function generateSearchToolDescription(requestHost, requestUrl) {
    try {
        console.log("Generating search tool description for host:", requestUrl);
        // Default description as fallback
        let description = "Search documentation for the current repository.";
        const { subdomain, path, owner, repo } = getRepoData(requestHost, requestUrl);
        if (subdomain && path) {
            description = `Search documentation from the ${subdomain}/${path} GitHub Pages.`;
        }
        else if (owner && repo) {
            description = `Search documentation from GitHub repository: ${owner}/${repo}.`;
        }
        return description;
    }
    catch (error) {
        // Return default description if there's any error parsing the URL
        return "Search documentation for the current repository.";
    }
}
/**
 * Generate a dynamic description for the fetch_documentation tool based on the URL
 * @param requestHost - The host from the request
 * @param requestUrl - The full request URL (optional)
 * @returns A descriptive string for the tool
 */
function generateToolDescription(requestHost, requestUrl) {
    try {
        console.log("Generating tool description for host:", requestUrl);
        // Default description as fallback
        let description = "Fetch documentation for the current repository.";
        const { subdomain, path, owner, repo } = getRepoData(requestHost, requestUrl);
        if (subdomain && path) {
            description = `Fetch documentation from the ${subdomain}/${path} GitHub Pages.`;
        }
        else if (owner && repo) {
            description = `Fetch documentation from GitHub repository: ${owner}/${repo}.`;
        }
        return description;
    }
    catch (error) {
        // Return default description if there's any error parsing the URL
        return "Fetch documentation for the current repository.";
    }
}
/**
 * Generate a dynamic tool name for the fetch_documentation tool based on the URL
 * @param requestHost - The host from the request
 * @param requestUrl - The full request URL (optional)
 * @returns A descriptive string for the tool
 */
function generateToolName(requestHost, requestUrl) {
    try {
        console.log("Generating tool name for host:", requestUrl);
        // Default tool name as fallback
        let toolName = "fetch_documentation";
        const { subdomain, path, owner, repo } = getRepoData(requestHost, requestUrl);
        if (subdomain && path) {
            toolName = `fetch_${subdomain}_${path}_documentation`;
        }
        else if (owner && repo) {
            toolName = `fetch_${owner}_${repo}_documentation`;
        }
        // replace non-alphanumeric characters with underscores
        return toolName.replace(/[^a-zA-Z0-9]/g, "_");
    }
    catch (error) {
        console.error("Error generating tool name:", error);
        // Return default tool name if there's any error parsing the URL
        return "fetch_documentation";
    }
}
async function fetchDocumentation({ requestHost, requestUrl, }) {
    const { subdomain, path, owner, repo } = getRepoData(requestHost, requestUrl);
    // Initialize fileUsed to prevent "used before assigned" error
    let fileUsed = "unknown";
    let content = null;
    // Check for subdomain pattern: {subdomain}.gitmcp.io/{path}
    if (subdomain && path) {
        // Map to github.io
        const baseURL = `https://${subdomain}.github.io/${path}/`;
        content = await fetchFile(baseURL + "llms.txt");
        fileUsed = "llms.txt";
    }
    // Check for github repo pattern: gitmcp.io/{owner}/{repo} or git-mcp.vercel.app/{owner}/{repo}
    else if (owner && repo) {
        // First check if we have a cached path for llms.txt
        const cachedPath = await getCachedFilePath(owner, repo, "llms.txt");
        if (cachedPath) {
            content = await fetchFileFromGitHub(owner, repo, cachedPath.branch, cachedPath.path);
            if (content) {
                fileUsed = `${cachedPath.path} (${cachedPath.branch} branch, from cache)`;
            }
        }
        // If no cached path or cached path failed, try static paths
        if (!content) {
            // Try static paths for llms.txt
            const possibleLocations = [
                "docs/docs/llms.txt", // Current default
                "llms.txt", // Root directory
                "docs/llms.txt", // Common docs folder
                "documentation/llms.txt", // Alternative docs folder
            ];
            // Try each location on 'main' branch first, then 'master' branch
            for (const location of possibleLocations) {
                // Try main branch
                content = await fetchFileFromGitHub(owner, repo, "main", location);
                if (content) {
                    fileUsed = `${location} (main branch)`;
                    // Cache the successful path
                    await cacheFilePath(owner, repo, "llms.txt", location, "main");
                    break;
                }
                // Try master branch
                content = await fetchFileFromGitHub(owner, repo, "master", location);
                if (content) {
                    fileUsed = `${location} (master branch)`;
                    // Cache the successful path
                    await cacheFilePath(owner, repo, "llms.txt", location, "master");
                    break;
                }
            }
            // Fallback to GitHub Search API if static paths don't work for llms.txt
            if (!content) {
                content = await searchGitHubRepo(owner, repo, "llms.txt");
                if (content) {
                    fileUsed = "llms.txt (found via GitHub Search API)";
                }
            }
        }
        // Fallback to README.md if llms.txt not found in any location
        if (!content) {
            // Only use static approach for README, no search API
            // Try main branch first
            content = await fetchFileFromGitHub(owner, repo, "main", "README.md");
            fileUsed = "readme.md (main branch)";
            // If not found, try master branch
            if (!content) {
                content = await fetchFileFromGitHub(owner, repo, "master", "README.md");
                fileUsed = "readme.md (master branch)";
            }
        }
        // Store documentation in vector database for later search
        if (content && owner && repo) {
            try {
                await storeDocumentationVectors(owner, repo, content);
                console.log(`Stored documentation vectors for ${owner}/${repo}`);
            }
            catch (error) {
                console.error(`Failed to store documentation vectors: ${error}`);
                // Continue despite vector storage failure
            }
        }
    }
    // Default/fallback case
    else {
        // Map "gitmcp.io" to "github.io"
        const mappedHost = requestHost.replace("gitmcp.io", "github.io");
        let baseURL = `https://${mappedHost}/${path}`;
        if (!baseURL.endsWith("/")) {
            baseURL += "/";
        }
        content = await fetchFile(baseURL + "llms.txt");
        fileUsed = "llms.txt";
        if (!content) {
            content = await fetchFile(baseURL + "readme.md");
            fileUsed = "readme.md";
        }
    }
    if (!content) {
        content = "No documentation found. Generated fallback content.";
        fileUsed = "generated";
    }
    return {
        fileUsed,
        content: [
            {
                type: "text",
                text: content,
            },
        ],
    };
}
/**
 * Search documentation using vector search
 * Will fetch and index documentation if none exists
 */
async function searchRepositoryDocumentation({ requestHost, requestUrl, query, forceReindex = false, }) {
    const hostHeader = requestHost;
    const url = new URL(requestUrl || "", `http://${hostHeader}`);
    const path = url.pathname.split("/").filter(Boolean).join("/");
    // Initialize owner and repo
    let owner = null;
    let repo = null;
    // Check for subdomain pattern: {subdomain}.gitmcp.io/{path}
    if (hostHeader.includes(".gitmcp.io")) {
        const subdomain = hostHeader.split(".")[0];
        owner = subdomain;
        repo = path || "docs";
    }
    // Check for github repo pattern: gitmcp.io/{owner}/{repo} or git-mcp.vercel.app/{owner}/{repo}
    else if (hostHeader === "gitmcp.io" || hostHeader === "git-mcp.vercel.app") {
        // Extract owner/repo from path
        [owner, repo] = path.split("/");
        if (!owner || !repo) {
            throw new Error("Invalid path format for GitHub repo. Expected: {owner}/{repo}");
        }
    }
    else {
        // For other cases, use hostname as owner and path as repo
        owner = hostHeader.replace(/\./g, "_");
        repo = path || "docs";
    }
    console.log(`Searching ${owner}/${repo} for "${query}"`);
    // First, check if this is the initial search for this repo/owner or if reindexing is forced
    let isFirstSearch = false;
    try {
        // Search for documentation using vector search
        let results = await searchDocumentation(owner, repo, query);
        // If no results or forceReindex is true, we need to index the documentation
        if (results.length === 0 || forceReindex) {
            console.log(`${forceReindex ? "Force reindexing" : "No search results found"} for ${query} in ${owner}/${repo}, fetching documentation first`);
            isFirstSearch = true;
            // Fetch the documentation
            const docResult = await fetchDocumentation({ requestHost, requestUrl });
            const content = docResult.content[0].text;
            const fileUsed = docResult.fileUsed;
            console.log(`Fetched documentation from ${fileUsed} (${content.length} characters)`);
            // Only index and search if we got actual content
            if (content &&
                owner &&
                repo &&
                content !== "No documentation found. Generated fallback content.") {
                try {
                    // Wait for vectors to be stored
                    const vectorCount = await storeDocumentationVectors(owner, repo, content);
                    console.log(`Successfully indexed ${vectorCount} document chunks for ${owner}/${repo}`);
                    // Wait a short time to ensure indexing is complete
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    // Search again after indexing
                    results = await searchDocumentation(owner, repo, query);
                    console.log(`Re-search after indexing found ${results.length} results`);
                    // If still no results on first search, send a message about indexing
                    if (results.length === 0 && isFirstSearch) {
                        return {
                            searchQuery: query,
                            content: [
                                {
                                    type: "text",
                                    text: `### Search Results for: "${query}"\n\n` +
                                        `We've just indexed the documentation for this repository (${vectorCount} chunks). ` +
                                        `Your search didn't match any sections.\n\n` +
                                        `Please try your search again in a moment, or try different search terms.`,
                                },
                            ],
                        };
                    }
                }
                catch (error) {
                    console.error(`Error indexing documentation: ${error}`);
                    // If there was an indexing error on first search, inform the user
                    if (isFirstSearch) {
                        return {
                            searchQuery: query,
                            content: [
                                {
                                    type: "text",
                                    text: `### Search Results for: "${query}"\n\n` +
                                        `We encountered an issue while indexing the documentation. ` +
                                        `Please try your search again in a moment.`,
                                },
                            ],
                        };
                    }
                }
            }
        }
        // Format search results as text for MCP response, or provide a helpful message if none
        let formattedText;
        if (results.length > 0) {
            formattedText = formatSearchResults(results, query);
        }
        else {
            // Provide more helpful guidance when no results are found
            formattedText =
                `### Search Results for: "${query}"\n\n` +
                    `No relevant documentation found for your query. The documentation for this repository has been indexed, ` +
                    `but no sections matched your specific search terms.\n\n` +
                    `Try:\n` +
                    `- Using different keywords\n` +
                    `- Being more specific about what you're looking for\n` +
                    `- Checking for basic information like "What is ${repo}?"\n` +
                    `- Using common terms like "installation", "tutorial", or "example"\n`;
        }
        // Return search results in proper MCP format
        return {
            searchQuery: query,
            content: [
                {
                    type: "text",
                    text: formattedText,
                },
            ],
        };
    }
    catch (error) {
        console.error(`Error in searchRepositoryDocumentation: ${error}`);
        return {
            searchQuery: query,
            content: [
                {
                    type: "text",
                    text: `### Search Results for: "${query}"\n\n` +
                        `An error occurred while searching the documentation. Please try again later.`,
                },
            ],
        };
    }
}
/**
 * Format search results into a readable text format
 * Ensures each documentation entry is properly separated
 * @param results - Array of search results
 * @param query - The original search query
 * @returns Formatted text with search results
 */
function formatSearchResults(results, query) {
    let output = `### Search Results for: "${query}"\n\n`;
    if (results.length === 0) {
        return output + "No results found.";
    }
    // Array to keep track of already displayed entries to avoid duplicates
    const displayedEntries = new Set();
    let resultCount = 0;
    results.forEach((result, index) => {
        // Check if this chunk contains multiple documentation entries
        // Documentation entries typically follow the pattern [Title](URL): Description
        const entryPattern = /\[.*?\]\(.*?\):\s*.*?(?=\n\n\[|$)/gs;
        const entries = result.chunk.match(entryPattern);
        if (entries && entries.length > 1) {
            // This chunk contains multiple entries, display each one separately
            entries.forEach((entry, entryIndex) => {
                // Skip duplicate entries
                const normalizedEntry = entry.trim();
                if (displayedEntries.has(normalizedEntry)) {
                    return;
                }
                resultCount++;
                displayedEntries.add(normalizedEntry);
                // Add header context if available
                let headerContext = "";
                const headerMatch = result.chunk.match(/^(#+\s+.*?)(?=\n\n)/);
                if (headerMatch) {
                    headerContext = headerMatch[1] + "\n\n";
                }
                output += `#### Result ${resultCount} (Score: ${result.score.toFixed(2)})\n\n${headerContext}${normalizedEntry}\n\n`;
                // Add separator if not the last entry
                if (index < results.length - 1 || entryIndex < entries.length - 1) {
                    output += "---\n\n";
                }
            });
        }
        else {
            // Single entry or non-standard format, display the whole chunk
            resultCount++;
            // Normalize the chunk to avoid duplicates
            const normalizedChunk = result.chunk.trim();
            if (displayedEntries.has(normalizedChunk)) {
                return;
            }
            displayedEntries.add(normalizedChunk);
            output += `#### Result ${resultCount} (Score: ${result.score.toFixed(2)})\n\n${normalizedChunk}\n\n`;
            // Add separator if not the last result
            if (index < results.length - 1) {
                output += "---\n\n";
            }
        }
    });
    return output;
}
//# sourceMappingURL=index.js.map