import React from "react";
import { Link } from "react-router-dom";

const PrivacyPolicy = () => {
  return (
    <div className="legal-document-container">
      <div className="legal-document">
        <div className="legal-nav">
          <Link to="/" className="legal-back-link">
            ← Back to Home
          </Link>
        </div>
        <header className="legal-header">
          <h1>Privacy Policy</h1>
          <div className="legal-meta">
            <p>
              <strong>Effective Date:</strong> November 2025
            </p>
            <p>
              <strong>Company:</strong> Swap Dietetics Private Limited
            </p>
            <p>
              <strong>Product:</strong> Restalytics (https://www.restalytics.ai)
            </p>
          </div>
        </header>

        <section>
          <h2>1. Introduction</h2>
          <p>
            Swap Dietetics Private Limited ("we," "us," or "our") operates the
            web platform Restalytics, which provides comprehensive analytics,
            reporting tools, and automated data processing for restaurant and
            food-tech businesses.
          </p>
          <p>
            This Privacy Policy explains how we collect, use, and protect
            information when you access our website, use our services, or sign
            in using Google OAuth.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>

          <h3>2.1 Google OAuth Information</h3>
          <p>When you sign in using Google OAuth, we may receive and store:</p>
          <ul>
            <li>Your name</li>
            <li>Email address</li>
            <li>Profile picture (if shared)</li>
            <li>Google Account ID (for authentication purposes)</li>
          </ul>

          <h3>2.2 Business Information</h3>
          <p>During account setup, we collect:</p>
          <ul>
            <li>Restaurant/Business name</li>
            <li>Business email address</li>
            <li>Phone number</li>
            <li>Location (State and City)</li>
            <li>Account password (encrypted)</li>
          </ul>

          <h3>2.3 Gmail Integration Data</h3>
          <p>With your explicit consent, we access and process:</p>
          <ul>
            <li>
              Email content from specific senders (e.g., Zomato, Swiggy, payment
              processors)
            </li>
            <li>
              Email attachments containing sales reports and analytics data
            </li>
            <li>
              Email metadata (sender, date, subject) for processing automation
            </li>
          </ul>
          <p className="important-note">
            <strong>Important:</strong> We only access emails relevant to your
            business analytics. We do not read personal emails or store
            unnecessary email content.
          </p>

          <h3>2.4 Uploaded Files and Data</h3>
          <ul>
            <li>CSV files, reports, and documents you upload for analysis</li>
            <li>Sales data, transaction records, and business metrics</li>
            <li>Custom configurations and dashboard preferences</li>
          </ul>

          <h3>2.5 Usage Information</h3>
          <ul>
            <li>Log data and access patterns</li>
            <li>Feature usage analytics</li>
            <li>Performance and error monitoring data</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>

          <h3>3.1 Core Services</h3>
          <ul>
            <li>Authenticate your account securely</li>
            <li>Process and analyze your business data</li>
            <li>Generate automated reports and insights</li>
            <li>Provide real-time dashboard analytics</li>
            <li>Send data processing notifications</li>
          </ul>

          <h3>3.2 Communication</h3>
          <ul>
            <li>Send essential account or service updates</li>
            <li>Notify you of new features or improvements</li>
            <li>Provide customer support</li>
            <li>Send weekly/monthly business insights (with your consent)</li>
          </ul>

          <h3>3.3 Service Improvement</h3>
          <ul>
            <li>Analyze usage patterns to improve our platform</li>
            <li>Debug issues and optimize performance</li>
            <li>Develop new features based on user needs</li>
          </ul>

          <p className="highlight">
            <strong>
              We never sell, rent, or trade your personal or business data.
            </strong>
          </p>
        </section>

        <section>
          <h2>4. Data Retention & Security</h2>

          <h3>4.1 Security Measures</h3>
          <ul>
            <li>
              All data is encrypted in transit (TLS/SSL) and at rest (AES-256)
            </li>
            <li>Multi-factor authentication support</li>
            <li>Regular security audits and monitoring</li>
            <li>AWS infrastructure with enterprise-grade security</li>
          </ul>

          <h3>4.2 Data Retention</h3>
          <ul>
            <li>Account information: Retained while your account is active</li>
            <li>
              Business data: Retained as long as necessary for service provision
            </li>
            <li>
              Email processing data: Automatically deleted after analysis
              completion
            </li>
            <li>Backup data: Retained for 30 days for disaster recovery</li>
          </ul>

          <h3>4.3 Data Location</h3>
          <p>
            Your data is stored on secure AWS servers located in Asia Pacific
            (Mumbai) region, ensuring compliance with Indian data protection
            requirements.
          </p>
        </section>

        <section>
          <h2>5. Sharing of Information</h2>
          <p>We do not share your information with third parties except:</p>

          <h3>5.1 Legal Requirements</h3>
          <ul>
            <li>When required by law, court order, or regulatory request</li>
            <li>To protect our rights, safety, or property</li>
            <li>To investigate fraud or security issues</li>
          </ul>

          <h3>5.2 Service Providers</h3>
          <ul>
            <li>AWS (cloud infrastructure and security)</li>
            <li>Google (OAuth authentication only)</li>
            <li>Email delivery services (for account notifications)</li>
          </ul>

          <h3>5.3 Business Transfers</h3>
          <p>
            In the event of a merger, acquisition, or sale of assets, user data
            may be transferred as part of that transaction.
          </p>
        </section>

        <section>
          <h2>6. Cookies and Analytics</h2>

          <h3>6.1 Essential Cookies</h3>
          <p>We use essential cookies for:</p>
          <ul>
            <li>Authentication and session management</li>
            <li>Security and fraud prevention</li>
            <li>Basic site functionality</li>
          </ul>

          <h3>6.2 Analytics</h3>
          <p>We use anonymized analytics to:</p>
          <ul>
            <li>Monitor site performance</li>
            <li>Understand feature usage</li>
            <li>Improve user experience</li>
          </ul>
          <p>
            You can disable cookies through your browser settings, though this
            may affect site functionality.
          </p>
        </section>

        <section>
          <h2>7. Your Rights and Choices</h2>

          <h3>7.1 Access and Control</h3>
          <ul>
            <li>View and download your account data</li>
            <li>Update your profile information</li>
            <li>Delete specific data or your entire account</li>
            <li>Opt-out of non-essential communications</li>
          </ul>

          <h3>7.2 Gmail Access Control</h3>
          <ul>
            <li>
              Revoke Gmail access anytime from your Google Account Permissions
            </li>
            <li>
              Control which emails are processed through our platform settings
            </li>
            <li>Delete processed email data from our systems</li>
          </ul>

          <h3>7.3 Data Portability</h3>
          <p>
            Request a copy of your data in a machine-readable format for
            transfer to another service.
          </p>
        </section>

        <section>
          <h2>8. Children's Privacy</h2>
          <p>
            Restalytics is not intended for individuals under 18 years of age.
            We do not knowingly collect personal information from children.
          </p>
        </section>

        <section>
          <h2>9. International Users</h2>
          <p>
            If you are accessing Restalytics from outside India, please be aware
            that your information may be transferred to, stored, and processed
            in India where our servers are located.
          </p>
        </section>

        <section>
          <h2>10. Updates to This Policy</h2>
          <p>
            We may update this Privacy Policy periodically to reflect changes in
            our practices or legal requirements. We will notify you of
            significant changes via email or platform notification. The latest
            version will always be available at
            https://www.restalytics.ai/privacy
          </p>
        </section>

        <section>
          <h2>11. Contact Us</h2>
          <p>For any privacy-related questions or requests:</p>

          <div className="contact-info">
            <p>
              <strong>Swap Dietetics Private Limited</strong>
            </p>
            <p>Hyderabad, Telangana, India</p>
            <p>
              <strong>Privacy:</strong> privacy@restalytics.ai
            </p>
            <p>
              <strong>General Support:</strong> support@restalytics.ai
            </p>
            <p>
              <strong>Data Protection Officer:</strong> dpo@restalytics.ai
            </p>
            <p>
              <strong>Response Time:</strong> We aim to respond to all privacy
              inquiries within 48 hours.
            </p>
          </div>
        </section>

        <footer className="legal-footer">
          <p>
            <em>Last Updated: November 2025</em>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
