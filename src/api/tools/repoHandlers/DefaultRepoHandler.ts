import {
  fetchDocumentation,
  searchRepositoryDocumentation,
  searchRepositoryCode,
  fetchUrlContent,
} from "../commonTools.js";
import { z } from "zod";
import type { RepoData } from "../../../shared/repoData.js";
import type { RepoHandler, Tool } from "./RepoHandler.js";
import { generateServerName } from "../../../shared/nameUtils.js";

class DefaultRepoHandler implements RepoHandler {
  name = "default";
  getTools(repoData: RepoData, env: any): Array<Tool> {
    // Generate a dynamic description based on the URL
    const fetchToolName = generateFetchToolName(repoData);
    const fetchToolDescription = generateFetchToolDescription(repoData);
    const searchToolName = generateSearchToolName(repoData);
    const searchToolDescription = generateSearchToolDescription(repoData);
    const codeSearchToolName = generateCodeSearchToolName(repoData);
    const codeSearchToolDescription =
      generateCodeSearchToolDescription(repoData);

    return [
      {
        name: fetchToolName,
        description: fetchToolDescription,
        paramsSchema: undefined,
        cb: async () => {
          return fetchDocumentation({ repoData, env });
        },
      },
      {
        name: searchToolName,
        description: searchToolDescription,
        paramsSchema: {
          query: z
            .string()
            .describe("The search query to find relevant documentation"),
        },
        cb: async ({ query }) => {
          return searchRepositoryDocumentation({
            repoData,
            query,
            env,
          });
        },
      },
      {
        name: codeSearchToolName,
        description: codeSearchToolDescription,
        paramsSchema: {
          query: z
            .string()
            .describe("The search query to find relevant code files"),
          page: z
            .number()
            .optional()
            .describe(
              "Page number to retrieve (starting from 1). Each page contains 30 results.",
            ),
        },
        cb: async ({ query, page }) => {
          return searchRepositoryCode({
            repoData,
            query,
            page,
            env,
          });
        },
      },
      {
        name: "fetch_url_content",
        description:
          "Fetch content from a URL. Use this to retrieve referenced documents or pages that were mentioned in previously fetched documentation.",
        paramsSchema: {
          url: z.string().describe("The URL of the document or page to fetch"),
        },
        cb: async ({ url }) => {
          return fetchUrlContent({ url, env });
        },
      },
    ];
  }

  async fetchDocumentation({
    repoData,
    env,
  }: {
    repoData: RepoData;
    env: any;
  }): Promise<{
    fileUsed: string;
    content: { type: "text"; text: string }[];
  }> {
    return await fetchDocumentation({ repoData, env });
  }

  async searchRepositoryDocumentation({
    repoData,
    query,
    env,
  }: {
    repoData: RepoData;
    query: string;
    env: any;
  }): Promise<{
    searchQuery: string;
    content: { type: "text"; text: string }[];
  }> {
    return await searchRepositoryDocumentation({
      repoData,
      query,
      env,
    });
  }
}

let defaultRepoHandler: DefaultRepoHandler;
export function getDefaultRepoHandler(): DefaultRepoHandler {
  if (!defaultRepoHandler) {
    defaultRepoHandler = new DefaultRepoHandler();
  }
  return defaultRepoHandler;
}

/**
 * Enforces the 60-character limit on the combined server and tool names
 * @param prefix - The prefix for the tool name (fetch_ or search_)
 * @param repo - The repository name
 * @param suffix - The suffix for the tool name (_documentation)
 * @returns A tool name that ensures combined length with server name stays under 60 characters
 */
function enforceToolNameLengthLimit(
  prefix: string,
  repo: string | null | undefined,
  suffix: string,
): string {
  if (!repo) {
    console.error(
      "Repository name is null/undefined in enforceToolNameLengthLimit",
    );
    return `${prefix}${suffix}`;
  }

  // Generate the server name to check combined length
  const serverNameLen = generateServerName(repo).length;

  // Replace non-alphanumeric characters with underscores
  let repoName = repo.replace(/[^a-zA-Z0-9]/g, "_");
  let toolName = `${prefix}${repoName}${suffix}`;

  // Calculate combined length
  const combinedLength = toolName.length + serverNameLen;

  // If combined length is already under limit, return it
  if (combinedLength <= 60) {
    return toolName;
  }

  // Step 1: Try shortening "_documentation" to "_docs"
  if (suffix === "_documentation") {
    toolName = `${prefix}${repoName}_docs`;
    if (toolName.length + serverNameLen <= 60) {
      return toolName;
    }
  }

  // Step 2: Shorten the repo name by removing words
  const words = repoName.split("_");
  if (words.length > 1) {
    // Keep removing words from the end until we're under the limit or have only one word left
    let shortenedRepo = repoName;
    for (let i = words.length - 1; i > 0; i--) {
      shortenedRepo = words.slice(0, i).join("_");
      toolName = `${prefix}${shortenedRepo}${suffix === "_documentation" ? "_docs" : suffix}`;
      if (toolName.length + serverNameLen <= 60) {
        return toolName;
      }
    }
  }

  // Step 3: As a last resort, truncate to fit
  const shortenedSuffix = suffix === "_documentation" ? "_docs" : suffix;
  const maxRepoLength =
    60 - prefix.length - shortenedSuffix.length - serverNameLen;
  const truncatedRepo = repoName.substring(0, Math.max(1, maxRepoLength));
  return `${prefix}${truncatedRepo}${shortenedSuffix}`;
}

/**
 * Generate a dynamic search tool name for the search_documentation tool based on the URL
 * @param requestHost - The host from the request
 * @param requestUrl - The full request URL (optional)
 * @returns A descriptive string for the tool name
 */
function generateSearchToolName({ urlType, repo }: RepoData): string {
  try {
    // Default tool name as fallback
    let toolName = "search_documentation";
    if (urlType == "subdomain" || urlType == "github") {
      // Use enforceLengthLimit to ensure the tool name doesn't exceed 60 characters
      return enforceToolNameLengthLimit("search_", repo, "_documentation");
    }
    // replace non-alphanumeric characters with underscores
    return toolName.replace(/[^a-zA-Z0-9]/g, "_");
  } catch (error) {
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
function generateSearchToolDescription({
  urlType,
  owner,
  repo,
}: RepoData): string {
  try {
    const fetchToolName = generateFetchToolName({
      urlType,
      owner,
      repo,
    });

    // Default description as fallback
    let description =
      "Semantically search within the fetched documentation for the current repository.";

    if (urlType == "subdomain") {
      description = `Semantically search within the fetched documentation from the ${owner}/${repo} GitHub Pages. Useful for specific queries. Don't call if you already used ${fetchToolName}.`;
    } else if (urlType == "github") {
      description = `Semantically search within the fetched documentation from GitHub repository: ${owner}/${repo}. Useful for specific queries. Don't call if you already used ${fetchToolName}.`;
    }

    return description;
  } catch (error) {
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
function generateFetchToolDescription({
  urlType,
  owner,
  repo,
}: Omit<RepoData, "host">): string {
  try {
    // Default description as fallback
    let description = "Fetch entire documentation for the current repository.";

    if (urlType == "subdomain") {
      description = `Fetch entire documentation file from the ${owner}/${repo} GitHub Pages. Useful for general questions.`;
    } else if (urlType == "github") {
      description = `Fetch entire documentation file from GitHub repository: ${owner}/${repo}. Useful for general questions.`;
    }

    return description;
  } catch (error) {
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
function generateFetchToolName({
  urlType,
  owner,
  repo,
}: Omit<RepoData, "host">): string {
  try {
    // Default tool name as fallback
    let toolName = "fetch_documentation";

    if (urlType == "subdomain" || urlType == "github") {
      // Use enforceLengthLimit to ensure the tool name doesn't exceed 60 characters
      return enforceToolNameLengthLimit("fetch_", repo, "_documentation");
    }

    // replace non-alphanumeric characters with underscores
    return toolName.replace(/[^a-zA-Z0-9]/g, "_");
  } catch (error) {
    console.error("Error generating tool name:", error);
    // Return default tool name if there's any error parsing the URL
    return "fetch_documentation";
  }
}

/**
 * Generate a dynamic tool name for the code search tool based on the URL
 * @param repoData - The repository data object
 * @returns A descriptive string for the tool
 */
function generateCodeSearchToolName({ urlType, repo }: RepoData): string {
  try {
    // Default tool name as fallback
    let toolName = "search_code";
    if (urlType == "subdomain" || urlType == "github") {
      // Use enforceLengthLimit to ensure the tool name doesn't exceed 60 characters
      return enforceToolNameLengthLimit("search_", repo, "_code");
    }
    // replace non-alphanumeric characters with underscores
    return toolName.replace(/[^a-zA-Z0-9]/g, "_");
  } catch (error) {
    console.error("Error generating code search tool name:", error);
    // Return default tool name if there's any error parsing the URL
    return "search_code";
  }
}

/**
 * Generate a dynamic description for the code search tool based on the URL
 * @param repoData - The repository data object
 * @returns A descriptive string for the tool
 */
function generateCodeSearchToolDescription({
  urlType,
  owner,
  repo,
}: RepoData): string {
  try {
    // Default description as fallback
    let description = "Search code files in the current repository.";

    if (urlType == "subdomain") {
      description = `Search for code within the ${owner}/${repo} GitHub repository. Returns matching files and code snippets.`;
    } else if (urlType == "github") {
      description = `Search for code within GitHub repository: ${owner}/${repo}. Returns matching files and code snippets.`;
    }

    return description;
  } catch (error) {
    // Return default description if there's any error parsing the URL
    return "Search code in the current repository.";
  }
}
