# Linear Issues MCP Server

This is a simple MCP (Model Context Protocol) server that provides read-only access to Linear issues. It allows language models to fetch Linear issues and their associated data using a Linear API token.

## Features

The server provides two tools:

- `linear_get_issue`: Fetches basic details about a Linear issue by URL or identifier
- `linear_get_issue_with_comments`: Fetches complete information about a Linear issue including all comments

## Requirements

- Node.js
- A Linear API token or OAuth access token

## Installation

No installation is needed if you use npx. Just make sure you have Node.js and npm installed.

Alternatively, you can clone this repository and run:

```bash
npm install
```

## Getting a Linear API Token

You can obtain a Linear API token in two ways:

1. **API Key (simplest):** Generate an API key in your [Linear API settings](https://linear.app/settings/api)

2. **OAuth Token:** For more advanced use cases or user-specific access
   - [Create an OAuth2 application in Linear](https://linear.app/settings/api/applications/new)
   - Follow the OAuth flow to get a user access token

## Usage with Claude for Desktop

To use this MCP server with Claude for Desktop:

1. Make sure you have your Linear API token ready
2. Add the server to your Claude for Desktop configuration at:

   - MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`
   - Windows: `%AppData%\Claude\claude_desktop_config.json`

Example configuration:

```json
{
  "mcpServers": {
    "linear-issues-mcp": {
      "command": "npx",
      "args": ["-y", "@keegancsmith/linear-issues-mcp-server"],
      "env": {
        "LINEAR_API_TOKEN": "your_linear_api_token_here"
      }
    }
  }
}
```

3. Restart Claude for Desktop
4. The API token is securely stored in the environment variable and doesn't need to be included in your prompts

## Example Usage

Once the server is set up, you can use it in Claude to interact with Linear issues:

```
Can you get me the details for issue ENG-123?
```

Claude will use the `linear_get_issue` tool with your issue ID, accessing the token from environment variables.

```
What are all the comments on the issue at https://linear.app/company/issue/ENG-123/issue-title?
```

Claude can use `linear_get_issue_with_comments` to fetch the full issue details including comments.

## Security Considerations

This server requires your Linear API token to function. This token provides read access to your Linear issues. The token is stored as an environment variable in your Claude for Desktop configuration, which keeps it secure and out of the chat history. This approach is much more secure than passing the token in a URL or as a parameter. Still, be cautious about sharing access to sensitive project information.

## Potential Additional Features

Possible enhancements for future versions:

- Search functionality for issues by query or filter criteria
- Team/project information access
- Issue history and timeline access
- Related issues lookup
- Issue templates access
- Status transition information
- User/assignee details
- Metrics and analytics for issues

## License

MIT
