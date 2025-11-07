import React, { useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import { Mail, Check } from 'lucide-react';

const FinalCTA = ({ user, onConnectGmail, onGoToDashboard }) => {
    const [hasConfettied, setHasConfettied] = useState(false);
    const [prefersReducedMotion] = useState(() =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    const handleCTAClick = () => {
        if (user) {
            onGoToDashboard();
            return;
        }

        // Show toast notification
        toast.success('Gmail connection will open in a secure popup.', {
            duration: 3000,
            position: 'top-center',
            icon: '🔒',
            style: {
                borderRadius: '10px',
                background: '#333',
                color: '#fff',
            }
        });

        // Trigger confetti only once and if motion is enabled
        if (!hasConfettied && !prefersReducedMotion) {
            const duration = 2000;
            const end = Date.now() + duration;

            const colors = ['#00FF8C', '#00C9FF', '#4285f4'];

            (function frame() {
                confetti({
                    particleCount: 3,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: colors
                });
                confetti({
                    particleCount: 3,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: colors
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());

            setHasConfettied(true);
        }

        // Slight delay before opening OAuth
        setTimeout(() => {
            onConnectGmail();
        }, 500);
    };

    const benefits = [
        'No uploads',
        'No setup',
        'Instant dashboard'
    ];

    return (
        <section className="final-cta-section">
            <div className="container">
                <motion.div
                    className="final-cta-content"
                    initial={prefersReducedMotion ? {} : { opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.8 }}
                >
                    <h2 className="final-cta-title">
                        Plug in your Gmail. Get instant clarity. Save your margins.
                    </h2>

                    <div className="final-cta-benefits">
                        {benefits.map((benefit, index) => (
                            <motion.div
                                key={index}
                                className="cta-benefit"
                                initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.8 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                            >
                                <Check size={20} className="benefit-check" />
                                <span>{benefit}</span>
                            </motion.div>
                        ))}
                    </div>

                    <motion.button
                        className="final-cta-button"
                        onClick={handleCTAClick}
                        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.5 }}
                        whileHover={prefersReducedMotion ? {} : {
                            scale: 1.05,
                            boxShadow: "0 20px 60px rgba(0,0,0,0.2)"
                        }}
                        whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
                    >
                        <Mail size={24} />
                        {user ? 'Go to Dashboard' : 'Connect Gmail & Audit My Discounts'}
                    </motion.button>

                    <motion.p
                        className="final-cta-subtext"
                        initial={prefersReducedMotion ? {} : { opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.7 }}
                    >
                        🔒 Secure OAuth • Read-only access • No credit card required
                    </motion.p>
                </motion.div>
            </div>
        </section>
    );
};

export default FinalCTA;
