#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create a new MCP server instance
const server = new McpServer({
  name: "linear-issues-mcp",
  version: "0.0.1",
  capabilities: {
    tools: {},
  },
  instructions:
    "This server provides read-only access to Linear issues. You can fetch details of a single Linear issue by providing its URL or identifier, or get comprehensive information including comments for a Linear issue. The Linear API token should be configured as an environment variable (LINEAR_API_TOKEN) in your MCP server configuration.",
});

/**
 * Extracts an issue ID from a Linear URL
 * @param {string} url - The Linear issue URL
 * @returns {string|null} - The extracted issue ID or null if not a valid Linear issue URL
 */
function parseIssueIDFromURL(urlStr) {
  try {
    const url = new URL(urlStr);
    if (!url.hostname.endsWith("linear.app")) {
      return null;
    }
    const match = url.pathname.match(/\/issue\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

/**
 * Makes a request to the Linear GraphQL API
 * @param {string} query - GraphQL query
 * @param {object} variables - Query variables
 * @param {string} accessToken - Linear API access token
 * @returns {Promise<object>} - API response data
 */
async function linearApiRequest(query, variables, accessToken) {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // API keys don't need Bearer prefix (unlike oauth)
      Authorization: accessToken.startsWith("lin_api_")
        ? accessToken
        : `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API request failed: ${response.statusText}`);
  }

  const json = await response.json();

  if (!json.data) {
    throw new Error("Linear API request failed: no data");
  }

  return json.data;
}

const issueFragment = `
  fragment IssueFragment on Issue {
      id
      identifier
      title
      url
      description
      state {
          name
      }
      priority
      priorityLabel
      assignee {
          name
          displayName
      }
      createdAt
      updatedAt
  }
`;

const issueQuery = `
  query IssueDetails($id: String!, $includeComments: Boolean!) {
    issue(id: $id) {
      ...IssueFragment
      comments @include(if: $includeComments) {
        nodes {
          body
          user {
            name
            displayName
          }
          createdAt
        }
      }
    }
  }
  ${issueFragment}
`;

/**
 * Fetches a Linear issue with optional comments
 * @param {string} issue - Linear issue URL or ID
 * @param {boolean} includeComments - Whether to include comments
 * @returns {Object} - Response object with issue details or error
 */
async function fetchLinearIssue(issue, includeComments = false) {
  // Get access token from environment variable
  const accessToken = process.env.LINEAR_API_TOKEN;

  if (!accessToken) {
    return {
      content: [
        {
          type: "text",
          text: "Error: No Linear API token found in environment. Set the LINEAR_API_TOKEN environment variable.",
        },
      ],
      isError: true,
    };
  }
  try {
    let issueId = issue;

    // Check if it's a URL and extract the ID if it is
    if (issue.startsWith("http")) {
      const parsedId = parseIssueIDFromURL(issue);
      if (!parsedId) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Invalid Linear issue URL: ${issue}`,
            },
          ],
          isError: true,
        };
      }
      issueId = parsedId;
    }

    const data = await linearApiRequest(
      issueQuery,
      { id: issueId, includeComments },
      accessToken
    );

    if (!data.issue) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Linear issue not found: ${issue}`,
          },
        ],
        isError: true,
      };
    }

    const issueData = data.issue;

    // Format the base issue data
    const formattedIssue = {
      identifier: issueData.identifier,
      title: issueData.title,
      url: issueData.url,
      description: issueData.description || "",
      state: issueData.state?.name || "",
      priority: issueData.priorityLabel || "",
      assignee: issueData.assignee
        ? issueData.assignee.displayName || issueData.assignee.name
        : "Unassigned",
      createdAt: new Date(issueData.createdAt).toISOString(),
      updatedAt: new Date(issueData.updatedAt).toISOString(),
    };

    // Add comments if requested
    if (includeComments && issueData.comments) {
      const formattedComments = (issueData.comments.nodes || []).map(
        (comment) => ({
          body: comment.body,
          author: comment.user
            ? comment.user.displayName || comment.user.name
            : "Unknown",
          createdAt: new Date(comment.createdAt).toISOString(),
        })
      );
      formattedIssue.comments = formattedComments;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(formattedIssue, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error fetching Linear issue${
            includeComments ? " with comments" : ""
          }: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Tool handler for linear_get_issue - Fetches a single Linear issue by URL or ID
 * @param {Object} params - Parameters from the tool call
 * @param {string} params.issue - Linear issue URL or ID
 * @returns {Object} - Response object with issue details or error
 */
async function getLinearIssue({ issue }) {
  return fetchLinearIssue(issue, false);
}

// Register the linear_get_issue tool
server.tool(
  "linear_get_issue",
  "Fetch details of a single Linear issue by providing its URL or identifier.",
  {
    issue: z
      .string()
      .describe(
        "Linear issue URL or identifier (e.g., 'ENG-123' or 'https://linear.app/team/issue/ENG-123/issue-title')"
      ),
  },
  getLinearIssue,
  {
    annotations: {
      readOnlyHint: true, // This tool doesn't modify anything
      destructiveHint: false, // This tool doesn't make destructive changes
      idempotentHint: true, // Repeated calls have the same effect
      openWorldHint: true, // This tool interacts with the external Linear API
    },
  }
);

/**
 * Tool handler for linear_get_issue_with_comments - Fetches a Linear issue with its comments
 * @param {Object} params - Parameters from the tool call
 * @param {string} params.issue - Linear issue URL or ID
 * @returns {Object} - Response object with issue details and comments or error
 */
async function getLinearIssueWithComments({ issue }) {
  return fetchLinearIssue(issue, true);
}

// Register the linear_get_issue_with_comments tool
server.tool(
  "linear_get_issue_with_comments",
  "Fetch a Linear issue with all its comments and complete information.",
  {
    issue: z
      .string()
      .describe(
        "Linear issue URL or identifier (e.g., 'ENG-123' or 'https://linear.app/team/issue/ENG-123/issue-title')"
      ),
  },
  getLinearIssueWithComments,
  {
    annotations: {
      readOnlyHint: true, // This tool doesn't modify anything
      destructiveHint: false, // This tool doesn't make destructive changes
      idempotentHint: true, // Repeated calls have the same effect
      openWorldHint: true, // This tool interacts with the external Linear API
    },
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Linear Issues MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
