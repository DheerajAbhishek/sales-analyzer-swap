import React from 'react'
import { Link } from 'react-router-dom'

const TermsOfService = () => {
    return (
        <div className="legal-document-container">
            <div className="legal-document">
                <div className="legal-nav">
                    <Link to="/" className="legal-back-link">← Back to Home</Link>
                </div>
                <header className="legal-header">
                    <h1>Terms of Service</h1>
                    <div className="legal-meta">
                        <p><strong>Effective Date:</strong> November 2025</p>
                        <p><strong>Company:</strong> Swap Dietetics Private Limited</p>
                        <p><strong>Product:</strong> Restalytics (https://www.restalytics.ai)</p>
                    </div>
                </header>

                <section>
                    <h2>1. Acceptance of Terms</h2>
                    <p>
                        By accessing, using, or registering for Restalytics, you acknowledge that you have
                        read, understood, and agree to be bound by these Terms of Service ("Terms") and our Privacy Policy.
                    </p>
                    <p>
                        If you do not agree to these Terms, please discontinue use of the platform immediately.
                    </p>
                </section>

                <section>
                    <h2>2. Description of Service</h2>

                    <h3>2.1 Core Services</h3>
                    <p>Restalytics provides:</p>
                    <ul>
                        <li>Automated restaurant analytics and reporting</li>
                        <li>Sales data processing and visualization</li>
                        <li>Multi-platform integration (Zomato, Swiggy, POS systems)</li>
                        <li>Email-based data extraction and analysis</li>
                        <li>Real-time business intelligence dashboards</li>
                        <li>Performance tracking and insights</li>
                    </ul>

                    <h3>2.2 Service Availability</h3>
                    <ul>
                        <li>We strive for 99.9% uptime but cannot guarantee uninterrupted service</li>
                        <li>We may modify, update, or discontinue features with reasonable notice</li>
                        <li>Scheduled maintenance will be communicated in advance when possible</li>
                    </ul>
                </section>

                <section>
                    <h2>3. Eligibility and Account Registration</h2>

                    <h3>3.1 Age and Capacity</h3>
                    <p>You must be:</p>
                    <ul>
                        <li>At least 18 years old</li>
                        <li>Capable of entering a binding contract under Indian law</li>
                        <li>Authorized to represent the business/restaurant for which you're using Restalytics</li>
                    </ul>

                    <h3>3.2 Account Requirements</h3>
                    <ul>
                        <li>Provide accurate and complete registration information</li>
                        <li>Maintain updated contact and business information</li>
                        <li>Use a valid email address for account communications</li>
                        <li>Complete Google OAuth authentication for Gmail integration</li>
                    </ul>
                </section>

                <section>
                    <h2>4. Account Security and Responsibilities</h2>

                    <h3>4.1 Account Security</h3>
                    <p>You are responsible for:</p>
                    <ul>
                        <li>Maintaining confidentiality of login credentials</li>
                        <li>All activities occurring under your account</li>
                        <li>Immediately notifying us of unauthorized access</li>
                        <li>Using strong passwords and enabling available security features</li>
                    </ul>

                    <h3>4.2 Authorized Use</h3>
                    <p>
                        Your account is for your business use only and may not be shared, transferred,
                        or used by unauthorized individuals.
                    </p>
                </section>

                <section>
                    <h2>5. Acceptable Use Policy</h2>

                    <h3>5.1 Permitted Uses</h3>
                    <p>You may use Restalytics to:</p>
                    <ul>
                        <li>Analyze your legitimate business data</li>
                        <li>Generate reports for your restaurant operations</li>
                        <li>Integrate with your authorized business accounts</li>
                        <li>Access features included in your service plan</li>
                    </ul>

                    <h3>5.2 Prohibited Activities</h3>
                    <p>You agree NOT to:</p>
                    <ul>
                        <li>Interfere with or disrupt the platform or servers</li>
                        <li>Attempt to access data belonging to other users</li>
                        <li>Use the service for unlawful, harmful, or unauthorized purposes</li>
                        <li>Reverse engineer, decompile, or attempt to extract source code</li>
                        <li>Upload malicious software, viruses, or harmful code</li>
                        <li>Violate any applicable laws or regulations</li>
                        <li>Create false accounts or impersonate others</li>
                        <li>Attempt to overwhelm our systems with excessive requests</li>
                    </ul>

                    <h3>5.3 Data Accuracy</h3>
                    <p>You represent that all data you provide or upload is:</p>
                    <ul>
                        <li>Accurate and legitimate business information</li>
                        <li>Owned by you or used with proper authorization</li>
                        <li>Free from confidential third-party information (unless authorized)</li>
                    </ul>
                </section>

                <section>
                    <h2>6. Intellectual Property Rights</h2>

                    <h3>6.1 Our Property</h3>
                    <p>
                        All content, features, functionality, trademarks, logos, and software constituting
                        Restalytics are the exclusive property of Swap Dietetics Private Limited and are
                        protected by Indian and international copyright, trademark, and other intellectual property laws.
                    </p>

                    <h3>6.2 Your License</h3>
                    <p>
                        We grant you a limited, non-exclusive, non-transferable, revocable license to use
                        Restalytics for your business purposes, subject to these Terms.
                    </p>

                    <h3>6.3 Your Data</h3>
                    <p>
                        You retain ownership of your business data. By using our service, you grant us a
                        limited license to process, analyze, and store your data solely to provide our services.
                    </p>
                </section>

                <section>
                    <h2>7. Payment Terms and Billing</h2>

                    <h3>7.1 Free Services</h3>
                    <p>Currently, Restalytics offers free access to core analytics features.</p>

                    <h3>7.2 Future Paid Services</h3>
                    <ul>
                        <li>We reserve the right to introduce paid plans in the future</li>
                        <li>Existing users will receive advance notice of any pricing changes</li>
                        <li>Continued use after pricing changes constitutes acceptance</li>
                    </ul>

                    <h3>7.3 Data Export</h3>
                    <p>You may export your data at any time, regardless of account status.</p>
                </section>

                <section>
                    <h2>8. Privacy and Data Protection</h2>

                    <h3>8.1 Data Processing</h3>
                    <p>
                        Your use of Restalytics is also governed by our Privacy Policy, which explains
                        how we collect, use, and protect your information.
                    </p>

                    <h3>8.2 Gmail Integration</h3>
                    <ul>
                        <li>Gmail access is optional but required for automated email processing</li>
                        <li>We only access emails relevant to business analytics</li>
                        <li>You can revoke Gmail permissions at any time</li>
                        <li>Processed email data is automatically deleted after analysis</li>
                    </ul>
                </section>

                <section>
                    <h2>9. Service Modifications and Termination</h2>

                    <h3>9.1 Service Changes</h3>
                    <p>We reserve the right to:</p>
                    <ul>
                        <li>Modify features, functionality, or technical requirements</li>
                        <li>Update these Terms with reasonable notice</li>
                        <li>Discontinue the service with 30 days advance notice</li>
                    </ul>

                    <h3>9.2 Account Termination</h3>
                    <p>We may suspend or terminate your account if you:</p>
                    <ul>
                        <li>Violate these Terms or our Acceptable Use Policy</li>
                        <li>Engage in fraudulent or harmful activities</li>
                        <li>Fail to comply with applicable laws</li>
                        <li>Remain inactive for an extended period (12+ months)</li>
                    </ul>

                    <h3>9.3 Effect of Termination</h3>
                    <p>Upon termination:</p>
                    <ul>
                        <li>Your access to Restalytics will be immediately suspended</li>
                        <li>We will provide 30 days to export your data</li>
                        <li>Processed data will be deleted according to our Privacy Policy</li>
                    </ul>
                </section>

                <section>
                    <h2>10. Disclaimers and Limitation of Liability</h2>

                    <h3>10.1 Service Disclaimer</h3>
                    <p>Restalytics is provided on an "AS-IS" and "AS-AVAILABLE" basis. We make no warranties regarding:</p>
                    <ul>
                        <li>Uninterrupted or error-free operation</li>
                        <li>Accuracy or completeness of analytics results</li>
                        <li>Fitness for any particular purpose</li>
                        <li>Security against all possible threats</li>
                    </ul>

                    <h3>10.2 Limitation of Liability</h3>
                    <p>To the maximum extent permitted by law, Swap Dietetics Private Limited shall not be liable for:</p>
                    <ul>
                        <li>Indirect, incidental, consequential, or punitive damages</li>
                        <li>Loss of profits, revenue, data, or business opportunities</li>
                        <li>Service interruptions or data loss</li>
                        <li>Third-party actions or content</li>
                    </ul>
                    <p className="highlight">
                        <strong>Maximum Liability:</strong> Our total liability for any claims related to
                        Restalytics shall not exceed Rs. 10,000 (Ten Thousand Indian Rupees).
                    </p>

                    <h3>10.3 Business Decision Disclaimer</h3>
                    <p>
                        Restalytics provides analytical tools and insights, but you are solely responsible
                        for business decisions based on this information.
                    </p>
                </section>

                <section>
                    <h2>11. Indemnification</h2>
                    <p>
                        You agree to indemnify and hold Swap Dietetics Private Limited harmless from any
                        claims, damages, losses, or expenses arising from:
                    </p>
                    <ul>
                        <li>Your use of Restalytics</li>
                        <li>Violation of these Terms</li>
                        <li>Infringement of third-party rights</li>
                        <li>Your business data or operations</li>
                    </ul>
                </section>

                <section>
                    <h2>12. Governing Law and Dispute Resolution</h2>

                    <h3>12.1 Governing Law</h3>
                    <p>
                        These Terms are governed by and construed in accordance with the laws of India,
                        without regard to conflict of law principles.
                    </p>

                    <h3>12.2 Jurisdiction</h3>
                    <p>
                        Any disputes arising from these Terms or your use of Restalytics shall be subject
                        to the exclusive jurisdiction of the courts of Hyderabad, Telangana, India.
                    </p>

                    <h3>12.3 Dispute Resolution Process</h3>
                    <ol>
                        <li><strong>Direct Communication:</strong> Contact us first to resolve issues amicably</li>
                        <li><strong>Mediation:</strong> If needed, we'll attempt mediation before litigation</li>
                        <li><strong>Legal Action:</strong> As a last resort, through Hyderabad courts only</li>
                    </ol>
                </section>

                <section>
                    <h2>13. Miscellaneous</h2>

                    <h3>13.1 Entire Agreement</h3>
                    <p>
                        These Terms, together with our Privacy Policy, constitute the complete agreement
                        between you and Swap Dietetics Private Limited regarding Restalytics.
                    </p>

                    <h3>13.2 Severability</h3>
                    <p>
                        If any provision of these Terms is found invalid or unenforceable, the remaining
                        provisions will continue in full force and effect.
                    </p>

                    <h3>13.3 Assignment</h3>
                    <p>
                        You may not assign these Terms or your account without our written consent. We may
                        assign our rights and obligations under these Terms.
                    </p>

                    <h3>13.4 Updates to Terms</h3>
                    <p>We may update these Terms periodically. Significant changes will be communicated via:</p>
                    <ul>
                        <li>Email notification to registered users</li>
                        <li>Prominent notice on the platform</li>
                        <li>Updated "Effective Date" at the top of this document</li>
                    </ul>
                    <p>Continued use after changes constitutes acceptance of the updated Terms.</p>
                </section>

                <section>
                    <h2>14. Contact Information</h2>
                    <p>For any questions about these Terms of Service:</p>

                    <div className="contact-info">
                        <p><strong>Swap Dietetics Private Limited</strong></p>
                        <p>Hyderabad, Telangana, India</p>
                        <p><strong>Legal:</strong> legal@restalytics.ai</p>
                        <p><strong>General Support:</strong> admin@swapnow.in</p>
                        <p><strong>Business Inquiries:</strong> business@restalytics.ai</p>
                        <p><strong>Business Hours:</strong> Monday - Friday, 9 AM - 6 PM IST</p>
                        <p><strong>Response Time:</strong> We aim to respond to all inquiries within 24-48 hours.</p>
                    </div>
                </section>

                <footer className="legal-footer">
                    <p><em>These Terms of Service are effective as of November 2025 and govern your use of Restalytics.</em></p>
                </footer>
            </div>
        </div>
    )
}

export default TermsOfService