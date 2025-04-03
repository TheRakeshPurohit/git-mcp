# GitMCP

<img width="1148" alt="image" src="https://github.com/user-attachments/assets/e0c719d2-62f4-450e-90f3-c7dd0194f0b9" />

<p align="center">
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#examples">Examples</a> •
  <a href="#faq">FAQ</a> •
  <a href="#privacy">Privacy</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>
<div align="center">

[![Twitter Follow](https://img.shields.io/twitter/follow/idosal1?style=social)](https://twitter.com/idosal1)
[![Twitter Follow](https://img.shields.io/twitter/follow/liadyosef?style=social)](https://twitter.com/liadyosef)
</div>

## What is GitMCP?

GitMCP is a free, open-source service that seamlessly transforms any GitHub project into a remote [Model Context Protocol (MCP)](https://modelcontextprotocol.github.io/) endpoint, enabling AI assistants to access and understand the project's documentation effortlessly.

## Features

- **Empower AI with GitHub Project Access**: Direct your AI assistant to GitMCP for instant access to any GitHub project's documentation, complete with semantic search capabilities to optimize token usage.
- **Zero Setup Required**: No configurations or modifications needed — GitMCP works out of the box.
- **Completely Free and Private**: GitMCP is free. We don't collect any personally identifiable information or queries. Plus, you can host it yourself!

## Usage

To make your GitHub repository accessible to AI assistants via GitMCP, use the following URL formats:

- For GitHub repositories: `gitmcp.io/{owner}/{repo}` 
- For GitHub Pages sites: `{owner}.gitmcp.io/{repo}`
- Dynamic endpoint: `gitmcp.io/docs`

Congratulations! The chosen GitHub project is now fully accessible to your AI.

Replace `{owner}` with your GitHub username or organization name and `{repo}` with your repository name. Once configured, your AI assistant can access the project's documentation seamlessly.
The dynamic endpoint doesn't require a pre-defined repository. When used, your AI assistant can dynamically input any Github repository to enjoy GitMCP's features.

<video src="https://github.com/user-attachments/assets/2c3afaf9-6c08-436e-9efd-db8710554430"></video>

## How It Works

GitMCP serves as a bridge between your GitHub repository's documentation and AI assistants by implementing the Model Context Protocol (MCP). When an AI assistant requires information from your repository, it sends a request to GitMCP. GitMCP retrieves the relevant content and provides semantic search capabilities, ensuring efficient and accurate information delivery.

## Examples

Here are some examples of how to use GitMCP with different repositories:

- **Example 1**: For the repository `https://github.com/octocat/Hello-World`, use: `https://gitmcp.io/octocat/Hello-World`
- **Example 2**: For the GitHub Pages site `langchain-ai.gitmcp.io/langgraph`, use: `https://langchain-ai.gitmcp.io/langgraph`
- **Example 3**: Use the generic `gitmcp.com/docs` endpoint for your AI to dynamically select a repository
- 
These URLs enable AI assistants to access and interact with the project's documentation through GitMCP.

## FAQ

### What is the Model Context Protocol?

The [Model Context Protocol](https://modelcontextprotocol.github.io/) is a standard that allows AI assistants to request and receive additional context from external sources in a structured manner, enhancing their understanding and performance.

### Does GitMCP work with any AI assistant?

Yes, GitMCP is compatible with any AI assistant supporting the Model Context Protocol, including tools like Cursor, VSCode, Claude, etc.

### Is GitMCP compatible with all GitHub projects?

Absolutely! GitMCP works with any public GitHub repository without requiring any modifications. It prioritizes the `llms.txt` file and falls back to `README.md` or other if the former is unavailable. Future updates aim to support additional documentation methods and even generate content dynamically.

### Does GitMCP cost money?

No, GitMCP is a free service to the community with no associated costs.

## Privacy

GitMCP doesn't store any personally identifiable information or queries.

## Contributing

We welcome contributions! Please take a look at our [contribution](https://github.com/idosal/git-mcp/blob/main/.github/CONTRIBUTING.md) guidelines.

## License

This project is licensed under the [MIT License](LICENSE).
