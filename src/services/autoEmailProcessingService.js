import { gmailIntegrationService } from "./gmailIntegrationService";

const DEFAULT_SENDER_EMAILS = ["billing@zomato.com", "payments@swiggy.in"];

class AutoEmailProcessingService {
  constructor() {
    this.processingStatus = new Map(); // Store status per user
  }

  /**
   * Auto-process emails from default senders after user signup
   */
  async startAutoProcessing(userEmail) {
    // Set initial status
    this.setStatus(userEmail, {
      isProcessing: true,
      total: DEFAULT_SENDER_EMAILS.length,
      completed: 0,
      results: [],
      errors: [],
    });

    // Dispatch event to update UI
    this.notifyStatusChange(userEmail);

    // Process each sender email
    for (let i = 0; i < DEFAULT_SENDER_EMAILS.length; i++) {
      const senderEmail = DEFAULT_SENDER_EMAILS[i];
      try {
        const result = await gmailIntegrationService.processEmailsFromSender(
          userEmail,
          senderEmail,
          150, // Max 150 emails
        );

        // Update status
        const status = this.getStatus(userEmail);
        status.completed++;
        status.results.push({
          senderEmail,
          success: result.success,
          data: result,
        });
        this.notifyStatusChange(userEmail);
      } catch (error) {
        console.error(`Γ¥î Error processing ${senderEmail}:`, error);

        const status = this.getStatus(userEmail);
        status.completed++;
        status.errors.push({
          senderEmail,
          error: error.message,
        });
        this.notifyStatusChange(userEmail);
      }
    }

    // Mark as complete
    const finalStatus = this.getStatus(userEmail);
    finalStatus.isProcessing = false;
    finalStatus.completedAt = new Date().toISOString();
    this.notifyStatusChange(userEmail);
    return finalStatus;
  }

  /**
   * Get processing status for a user
   */
  getStatus(userEmail) {
    if (!this.processingStatus.has(userEmail)) {
      return {
        isProcessing: false,
        total: 0,
        completed: 0,
        results: [],
        errors: [],
      };
    }
    return this.processingStatus.get(userEmail);
  }

  /**
   * Set processing status for a user
   */
  setStatus(userEmail, status) {
    this.processingStatus.set(userEmail, status);
  }

  /**
   * Clear status for a user
   */
  clearStatus(userEmail) {
    this.processingStatus.delete(userEmail);
  }

  /**
   * Notify UI components of status change
   */
  notifyStatusChange(userEmail) {
    const status = this.getStatus(userEmail);
    window.dispatchEvent(
      new CustomEvent("autoEmailProcessingUpdate", {
        detail: { userEmail, status },
      }),
    );
  }

  /**
   * Check if processing is active for a user
   */
  isProcessing(userEmail) {
    const status = this.getStatus(userEmail);
    return status.isProcessing;
  }

  /**
   * Get progress percentage
   */
  getProgress(userEmail) {
    const status = this.getStatus(userEmail);
    if (status.total === 0) return 0;
    return Math.round((status.completed / status.total) * 100);
  }
}

export const autoEmailProcessingService = new AutoEmailProcessingService();
