import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Clock, Zap } from 'lucide-react';

const NewPricing = ({ user, onGetStarted, onGoToDashboard }) => {
    const [prefersReducedMotion] = useState(() =>
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    const plans = [
        {
            name: 'Sales Analysis',
            originalPrice: '₹499',
            currentPrice: 'FREE',
            period: 'for now',
            features: [
                'Real-time sales analytics',
                'Multi-channel reporting (Swiggy, Zomato)',
                'Revenue insights & profit trends',
                'Performance tracking',
                'Growth metrics',
                'Gmail-based auto data sync'
            ],
            cta: 'Start Free — No Card Required',
            available: true,
            popular: false,
            icon: <Check size={20} />
        },
        {
            name: 'Inventory & Sales',
            currentPrice: '₹599',
            period: '/month',
            badge: 'Coming Soon',
            features: [
                'Everything in Sales Analysis',
                '🔥 Inventory tracking',
                '🔥 Cost management & wastage',
                '🔥 Low-stock alerts',
                '🔥 Supplier management',
                '🔥 Ingredient-level food cost'
            ],
            cta: 'Coming Soon',
            available: false,
            popular: true,
            icon: <Clock size={20} />
        },
        {
            name: 'Complete Business Suite',
            currentPrice: '₹699',
            period: '/month',
            badge: 'Coming Soon',
            features: [
                'Everything in Inventory & Sales',
                '🚀 Smart GST filing',
                '🚀 Tax compliance',
                '🚀 Financial reporting',
                '🚀 Automated invoicing',
                '🚀 Priority support'
            ],
            cta: 'Coming Soon',
            available: false,
            popular: false,
            icon: <Zap size={20} />
        }
    ];

    const cardVariants = {
        hidden: prefersReducedMotion ? {} : { opacity: 0, y: 30 },
        visible: (index) => ({
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.6,
                delay: index * 0.2,
                ease: [0.25, 0.46, 0.45, 0.94]
            }
        })
    };

    const handleCTAClick = (plan) => {
        if (!plan.available) return;
        if (user) {
            onGoToDashboard();
        } else {
            onGetStarted();
        }
    };

    return (
        <section className="new-pricing-section" id="pricing">
            <div className="container">
                <motion.h2
                    className="section-title"
                    initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6 }}
                >
                    Choose Your Plan
                </motion.h2>

                <motion.p
                    className="section-subtitle"
                    initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                >
                    Start with our free Sales Analysis tier — no credit card required
                </motion.p>

                <div className="pricing-grid-new">
                    {plans.map((plan, index) => (
                        <motion.div
                            key={index}
                            className={`pricing-card-new ${plan.popular ? 'popular' : ''} ${!plan.available ? 'disabled' : ''}`}
                            custom={index}
                            variants={cardVariants}
                            initial="hidden"
                            whileInView="visible"
                            viewport={{ once: true, margin: "-100px" }}
                            whileHover={plan.available && !prefersReducedMotion ? {
                                y: -8,
                                boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
                                transition: { duration: 0.2 }
                            } : {}}
                        >
                            {plan.badge && (
                                <div className="pricing-badge-new">{plan.badge}</div>
                            )}

                            <div className="pricing-icon-new">
                                {plan.icon}
                            </div>

                            <h3 className="pricing-plan-name">{plan.name}</h3>

                            <div className="pricing-price-new">
                                {plan.originalPrice && (
                                    <span className="original-price">{plan.originalPrice}</span>
                                )}
                                <div className="current-price-wrapper">
                                    <span className="current-price">{plan.currentPrice}</span>
                                    <span className="price-period">{plan.period}</span>
                                </div>
                            </div>

                            <ul className="pricing-features-new">
                                {plan.features.map((feature, idx) => (
                                    <motion.li
                                        key={idx}
                                        initial={prefersReducedMotion ? {} : { opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.3, delay: 0.4 + idx * 0.1 }}
                                    >
                                        <span className="feature-checkmark">
                                            {feature.startsWith('✅') || feature.startsWith('🔥') || feature.startsWith('🚀')
                                                ? feature.slice(0, 2)
                                                : '✅'}
                                        </span>
                                        <span>{feature.replace(/^(✅|🔥|🚀)\s*/, '')}</span>
                                    </motion.li>
                                ))}
                            </ul>

                            <button
                                className={`pricing-cta-new ${!plan.available ? 'disabled' : ''}`}
                                onClick={() => handleCTAClick(plan)}
                                disabled={!plan.available}
                            >
                                {plan.cta}
                            </button>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default NewPricing;
