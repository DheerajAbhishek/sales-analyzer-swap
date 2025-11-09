import { googleOAuthService } from "../services/googleOAuthService.js";

/**
 * Google APIs Integration Service
 * Provides methods to integrate Gmail and Google Drive data with your sales dashboard
 */
class GoogleApisService {
  /**
   * Extract sales-related emails from Gmail
   * Useful for finding order confirmations, customer inquiries, etc.
   */
  async getSalesRelatedEmails(options = {}) {
    const {
      maxResults = 50,
      timeRange = "1w", // 1d, 1w, 1m, 1y
      keywords = [
        "order",
        "purchase",
        "invoice",
        "receipt",
        "sale",
        "customer",
      ],
    } = options;

    try {
      // Build search query for sales-related emails
      const keywordQuery = keywords
        .map((keyword) => `subject:${keyword} OR body:${keyword}`)
        .join(" OR ");
      const timeQuery = `newer_than:${timeRange}`;
      const query = `(${keywordQuery}) AND ${timeQuery}`;

      const messages = await googleOAuthService.getGmailMessages(
        query,
        maxResults,
      );

      // Process and categorize emails
      const categorizedEmails = {
        orders: [],
        inquiries: [],
        receipts: [],
        feedback: [],
        other: [],
      };

      // You can enhance this with actual message content parsing
      for (const message of messages.messages || []) {
        // Get full message details
        const messageDetails = await this.getGmailMessage(message.id);
        const category = this.categorizeEmail(messageDetails);
        categorizedEmails[category].push(messageDetails);
      }

      return categorizedEmails;
    } catch (error) {
      console.error("Error fetching sales emails:", error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific Gmail message
   */
  async getGmailMessage(messageId) {
    try {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
      return await googleOAuthService.makeAuthenticatedRequest(url);
    } catch (error) {
      console.error("Error fetching message details:", error);
      throw error;
    }
  }

  /**
   * Categorize email based on subject and content
   */
  categorizeEmail(messageDetails) {
    const subject = this.getEmailSubject(messageDetails);
    const snippet = messageDetails.snippet || "";

    const text = (subject + " " + snippet).toLowerCase();

    if (
      text.includes("order") ||
      text.includes("purchase") ||
      text.includes("bought")
    ) {
      return "orders";
    } else if (
      text.includes("receipt") ||
      text.includes("invoice") ||
      text.includes("payment")
    ) {
      return "receipts";
    } else if (
      text.includes("question") ||
      text.includes("inquiry") ||
      text.includes("help")
    ) {
      return "inquiries";
    } else if (
      text.includes("review") ||
      text.includes("feedback") ||
      text.includes("rating")
    ) {
      return "feedback";
    } else {
      return "other";
    }
  }

  /**
   * Extract email subject from message details
   */
  getEmailSubject(messageDetails) {
    const headers = messageDetails.payload?.headers || [];
    const subjectHeader = headers.find(
      (header) => header.name.toLowerCase() === "subject",
    );
    return subjectHeader?.value || "No Subject";
  }

  /**
   * Get sales-related files from Google Drive
   * Useful for finding spreadsheets, PDFs, reports, etc.
   */
  async getSalesRelatedFiles(options = {}) {
    const {
      maxResults = 20,
      fileTypes = ["spreadsheet", "pdf", "document"],
      keywords = ["sales", "revenue", "report", "data", "analytics"],
    } = options;

    try {
      const fileQueries = [];

      // Search by file type
      fileTypes.forEach((type) => {
        let mimeType = "";
        switch (type) {
          case "spreadsheet":
            mimeType = "application/vnd.google-apps.spreadsheet";
            break;
          case "pdf":
            mimeType = "application/pdf";
            break;
          case "document":
            mimeType = "application/vnd.google-apps.document";
            break;
        }
        if (mimeType) {
          fileQueries.push(`mimeType='${mimeType}'`);
        }
      });

      // Search by keywords in filename
      const keywordQueries = keywords.map(
        (keyword) => `name contains '${keyword}'`,
      );

      const query = `(${fileQueries.join(" or ")}) and (${keywordQueries.join(" or ")})`;

      const files = await googleOAuthService.getDriveFiles(query, maxResults);

      // Categorize files
      const categorizedFiles = {
        spreadsheets: [],
        reports: [],
        documents: [],
        other: [],
      };

      for (const file of files.files || []) {
        const category = this.categorizeFile(file);
        categorizedFiles[category].push(file);
      }

      return categorizedFiles;
    } catch (error) {
      console.error("Error fetching sales files:", error);
      throw error;
    }
  }

  /**
   * Categorize file based on type and name
   */
  categorizeFile(file) {
    const name = file.name.toLowerCase();
    const mimeType = file.mimeType;

    if (mimeType.includes("spreadsheet")) {
      return "spreadsheets";
    } else if (
      name.includes("report") ||
      name.includes("analytics") ||
      name.includes("summary")
    ) {
      return "reports";
    } else if (mimeType.includes("document") || mimeType.includes("pdf")) {
      return "documents";
    } else {
      return "other";
    }
  }

  /**
   * Download file content from Google Drive
   */
  async downloadDriveFile(fileId) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      return await googleOAuthService.makeAuthenticatedRequest(url);
    } catch (error) {
      console.error("Error downloading file:", error);
      throw error;
    }
  }

  /**
   * Get file metadata from Google Drive
   */
  async getDriveFileMetadata(fileId) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,modifiedTime,owners,parents`;
      return await googleOAuthService.makeAuthenticatedRequest(url);
    } catch (error) {
      console.error("Error getting file metadata:", error);
      throw error;
    }
  }

  /**
   * Search for customer emails by domain or email address
   */
  async getCustomerEmails(customerDomain, maxResults = 20) {
    try {
      const query = `from:${customerDomain} OR to:${customerDomain}`;
      const messages = await googleOAuthService.getGmailMessages(
        query,
        maxResults,
      );

      const customerEmails = [];
      for (const message of messages.messages || []) {
        const messageDetails = await this.getGmailMessage(message.id);
        customerEmails.push({
          id: messageDetails.id,
          subject: this.getEmailSubject(messageDetails),
          snippet: messageDetails.snippet,
          date: new Date(parseInt(messageDetails.internalDate)),
          threadId: messageDetails.threadId,
        });
      }

      return customerEmails;
    } catch (error) {
      console.error("Error fetching customer emails:", error);
      throw error;
    }
  }

  /**
   * Export data to Google Sheets
   * Creates a new spreadsheet with sales data
   */
  async exportToGoogleSheets(data, sheetName = "Sales Data Export") {
    try {
      // Create a new spreadsheet
      const createUrl = "https://sheets.googleapis.com/v4/spreadsheets";
      const createPayload = {
        properties: {
          title: `${sheetName} - ${new Date().toISOString().split("T")[0]}`,
        },
      };

      const spreadsheet = await googleOAuthService.makeAuthenticatedRequest(
        createUrl,
        {
          method: "POST",
          body: JSON.stringify(createPayload),
        },
      );

      // Add data to the spreadsheet
      const spreadsheetId = spreadsheet.spreadsheetId;
      const range = "Sheet1!A1";
      const valueRange = {
        range: range,
        majorDimension: "ROWS",
        values: data,
      };

      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`;
      await googleOAuthService.makeAuthenticatedRequest(updateUrl, {
        method: "PUT",
        body: JSON.stringify(valueRange),
      });

      return {
        spreadsheetId: spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        title: createPayload.properties.title,
      };
    } catch (error) {
      console.error("Error exporting to Google Sheets:", error);
      throw error;
    }
  }
}

export const googleApisService = new GoogleApisService();
