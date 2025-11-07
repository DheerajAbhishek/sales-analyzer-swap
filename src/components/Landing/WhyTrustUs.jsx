import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Bell, ShieldAlert, RefreshCw } from 'lucide-react';

const WhyTrustUs = () => {
    const [prefersReducedMotion] = useState(() =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    const benefits = [
        {
            icon: <Eye size={24} />,
            text: 'Transparent tracking',
            description: 'See every discount, ad spend, and commission in real-time'
        },
        {
            icon: <Bell size={24} />,
            text: 'Budget control & alerts',
            description: 'Get notified when spends exceed your planned budgets'
        },
        {
            icon: <ShieldAlert size={24} />,
            text: 'Detect unauthorized discounts',
            description: 'Catch platform-applied discounts you never approved'
        },
        {
            icon: <RefreshCw size={24} />,
            text: 'Always up-to-date via Gmail',
            description: 'No manual uploads — data syncs automatically from emails'
        }
    ];

    const itemVariants = {
        hidden: prefersReducedMotion ? {} : { opacity: 0, scale: 0.8 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: {
                duration: 0.5,
                ease: [0.25, 0.46, 0.45, 0.94]
            }
        }
    };

    const containerVariants = {
        hidden: {},
        visible: {
            transition: {
                staggerChildren: 0.15
            }
        }
    };

    return (
        <section className="why-trust-section">
            <div className="container">
                <motion.h2
                    className="section-title"
                    initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                >
                    Why Restaurants Trust Restalytics
                </motion.h2>

                <motion.div
                    className="trust-benefits"
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-100px" }}
                >
                    {benefits.map((benefit, index) => (
                        <motion.div
                            key={index}
                            className="trust-benefit-item"
                            variants={itemVariants}
                            whileHover={prefersReducedMotion ? {} : {
                                scale: 1.02,
                                transition: { duration: 0.2 }
                            }}
                        >
                            <div className="benefit-icon">
                                {benefit.icon}
                            </div>
                            <div className="benefit-content">
                                <h3 className="benefit-title">{benefit.text}</h3>
                                <p className="benefit-description">{benefit.description}</p>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default WhyTrustUs;
