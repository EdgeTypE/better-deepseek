export const VERSION_HISTORY = [
  {
    version: "0.1.6",
    date: "2026-05-12",
    title: "Android & Organization",
    features: [
      {
        type: "platform",
        title: "Android Version",
        description: "Better DeepSeek is now available on <a href='https://github.com/EdgeTypE/better-deepseek/releases' target='_blank' style='color: #4d6bfe; text-decoration: underline;'>Android</a>."
      },
      {
        type: "organization",
        title: "Chat Filtering & Tags",
        description: "Organize your sessions by adding tags. Filter and group chats easily from the sidebar menu."
      },
      {
        type: "export",
        title: "Export UI Rework",
        description: "Newly designed export interface for Markdown, PDF, HTML, and Images. Export full sessions or specific parts."
      }
    ]
  },
  {
    version: "0.1.5",
    date: "2026-05-06",
    title: "Refinement & Visibility",
    features: [
      {
        type: "feature",
        title: "What's New Popup",
        description: "You're looking at it! We'll now keep you updated on the latest changes right here."
      },
      {
        type: "feature",
        title: "Advanced Injection Control",
        description: "Choose between 'Always', 'First Message', or 'Every X' messages with customizable intervals for system prompts."
      },
      {
        type: "feature",
        title: "Private Repo Support",
        description: "Import private repositories via GitHub Personal Access Tokens securely."
      },
      {
        type: "feature",
        title: "Token & Price Estimation",
        description: "Real-time token usage estimation and context window display for API-equivalent usage."
      },
      {
        type: "settings",
        title: "Disable Memory",
        description: "New toggle in Settings to prevent the extension from persisting conversation context."
      },
      {
        type: "bugfix",
        title: "Stability Improvements",
        description: "Resolved issues with message handling and refined the overall UI state."
      }
    ]
  },
  {
    version: "0.1.4",
    date: "2026-04-30",
    title: "Projects & Advanced Settings",
    features: [
      {
        type: "organization",
        title: "Projects Menu",
        description: "Better organizational control for sessions and files."
      },
      {
        type: "search",
        title: "History Search",
        description: "Added search functionality to the session history sidebar."
      },
      {
        type: "settings",
        title: "Advanced Settings",
        description: "Reworked settings menu with an accordion layout to save space and improve focus."
      },
      {
        type: "settings",
        title: "Disable System Prompt",
        description: "New option to disable the Hidden System Prompt entirely when not needed."
      },
      {
        type: "settings",
        title: "Force Language",
        description: "Ensure DeepSeek always responds in your preferred language, regardless of input."
      }
    ]
  },
  {
    version: "0.1.3",
    date: "2026-04-28",
    title: "Ask Questions & Exports",
    features: [
      {
        type: "interactive",
        title: "Ask Questions Tool",
        description: "DeepSeek can now ask for clarification when unsure about context or instructions."
      },
      {
        type: "export",
        title: "Markdown & PDF Export",
        description: "Export your full chat sessions to Markdown and PDF files."
      },
      {
        type: "settings",
        title: "Prompt Reset",
        description: "Easily reset the system prompt to its default state."
      },
      {
        type: "bugfix",
        title: "Navigation Fixes",
        description: "Resolved full page reloading issues when clicking the logo or 'New Chat'."
      }
    ]
  },
  {
    version: "0.1.2",
    date: "2026-04-23",
    title: "Cross-Browser & Code Runners",
    features: [
      {
        type: "crossplatform",
        title: "Firefox Support",
        description: "Added experimental support for the Firefox browser."
      },
      {
        type: "developer",
        title: "Enhanced Code Runners",
        description: "Updated Python runner and added new JS and TS execution environments."
      },
      {
        type: "developer",
        title: "GitHub Auto-Fetch",
        description: "Inject GitHub repositories directly into the chat via the BDS:AUTO command."
      }
    ]
  },
  {
    version: "0.1.1",
    date: "2026-04-18",
    title: "Voice Support & Reliability",
    features: [
      {
        type: "voice",
        title: "Full Voice Support",
        description: "Complete Speech-to-Text and Text-to-Speech integration."
      },
      {
        type: "settings",
        title: "Voice Configuration",
        description: "Configurable voice and recognition languages available in Settings."
      },
      {
        type: "feature",
        title: "Improved Navigation",
        description: "Logo and 'New Chat' are now real <a> tags, supporting 'Open in new tab'."
      },
      {
        type: "performance",
        title: "Streaming Reliability",
        description: "Better handling of stalled streams and automatic closing of tags."
      }
    ]
  }
];

export const LATEST_VERSION = VERSION_HISTORY[0];

