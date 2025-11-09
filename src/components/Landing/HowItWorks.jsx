import React, { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Download, TrendingUp, Check } from "lucide-react";

const HowItWorks = () => {
  const [prefersReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const steps = [
    {
      icon: <Mail size={32} />,
      title: "Connect Gmail",
      description: "One-click secure OAuth connection to your restaurant email",
      color: "#4285f4",
    },
    {
      icon: <Download size={32} />,
      title: "Auto-fetch Payouts",
      description:
        "Automatically extract sales data from Swiggy & Zomato emails",
      color: "#00FF8C",
    },
    {
      icon: <TrendingUp size={32} />,
      title: "Instant Spend Insights",
      description:
        "Real-time dashboard showing discounts, ads, and profit margins",
      color: "#00C9FF",
    },
  ];

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const cardVariants = {
    hidden: prefersReducedMotion ? {} : { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  };

  const checkmarkVariants = {
    hidden: { scale: 0 },
    visible: {
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 200,
        damping: 10,
      },
    },
  };

  return (
    <section className="how-it-works-section">
      <div className="container">
        <motion.h2
          className="section-title"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          How It Works
        </motion.h2>

        <motion.div
          className="steps-grid"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {steps.map((step, index) => (
            <motion.div
              key={index}
              className="step-card"
              variants={cardVariants}
              whileHover={
                prefersReducedMotion
                  ? {}
                  : {
                      y: -8,
                      transition: { duration: 0.2 },
                    }
              }
            >
              <div className="step-number">{index + 1}</div>
              <motion.div
                className="step-icon"
                style={{ color: step.color }}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                transition={{ delay: 0.3 + index * 0.2 }}
              >
                {step.icon}
              </motion.div>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-description">{step.description}</p>
              <motion.div
                className="step-checkmark"
                variants={checkmarkVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                transition={{ delay: 0.5 + index * 0.2 }}
              >
                <Check size={20} />
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorks;
