import React from 'react';
import { Link } from 'react-router-dom';

const NewFooter = () => {
    return (
        <footer className="new-landing-footer">
            <div className="footer-container-new">
                <div className="footer-brand">
                    <div className="footer-logo-section">
                        <img src="/restalyticsLogo.png" alt="Restalytics" className="footer-logo-new" />
                    </div>
                    <p className="footer-tagline">
                        <strong>Restalytics.ai</strong> — Built by restaurant owners, for restaurant owners.
                    </p>
                    <p className="footer-company">
                        Powered by <strong>Swap Dietetics Pvt. Ltd.</strong> • Made in India 🇮🇳
                    </p>
                </div>

                <div className="footer-links-section">
                    <div className="footer-links-column">
                        <h4>Product</h4>
                        <ul>
                            <li><a href="#pricing" onClick={(e) => {
                                e.preventDefault();
                                document.querySelector('.new-pricing-section')?.scrollIntoView({ behavior: 'smooth' });
                            }}>Pricing</a></li>
                            <li><a href="#features">Features</a></li>
                            <li><a href="https://calendly.com/dheerajabhishek111/30min" target="_blank" rel="noopener noreferrer">Book a Demo</a></li>
                        </ul>
                    </div>

                    <div className="footer-links-column">
                        <h4>Legal</h4>
                        <ul>
                            <li><Link to="/privacy">Privacy Policy</Link></li>
                            <li><Link to="/terms">Terms of Service</Link></li>
                        </ul>
                    </div>

                    <div className="footer-links-column">
                        <h4>Contact</h4>
                        <ul>
                            <li><a href="mailto:admin@swapnow.in">admin@swapnow.in</a></li>
                            <li><a href="mailto:support@restalytics.ai">Support</a></li>
                        </ul>
                    </div>
                </div>
            </div>

            <div className="footer-bottom">
                <p>&copy; {new Date().getFullYear()} Restalytics. All rights reserved.</p>
            </div>
        </footer>
    );
};

export default NewFooter;
