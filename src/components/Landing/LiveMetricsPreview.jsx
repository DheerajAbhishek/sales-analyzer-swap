import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingDown, AlertCircle, TrendingUp, Percent } from "lucide-react";

const LiveMetricsPreview = () => {
  const [counts, setCounts] = useState({
    discounts: 0,
    adsRunning: 0,
    profitLeakage: 0,
    commission: 0,
  });

  const [prefersReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Target values
  const targets = {
    discounts: 24500,
    adsRunning: 3,
    profitLeakage: 18200,
    commission: 23.5,
  };

  // Animated count-up effect
  useEffect(() => {
    if (prefersReducedMotion) {
      setCounts(targets);
      return;
    }

    const duration = 2000; // 2 seconds
    const steps = 60;
    const interval = duration / steps;

    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;

      setCounts({
        discounts: Math.floor(targets.discounts * progress),
        adsRunning: Math.floor(targets.adsRunning * progress),
        profitLeakage: Math.floor(targets.profitLeakage * progress),
        commission: parseFloat((targets.commission * progress).toFixed(1)),
      });

      if (currentStep >= steps) {
        clearInterval(timer);
        setCounts(targets);
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  // Mini sparkline data
  const sparklineData = [
    { value: 20 },
    { value: 35 },
    { value: 25 },
    { value: 45 },
    { value: 30 },
    { value: 55 },
    { value: 40 },
  ];

  const metrics = [
    {
      icon: <TrendingDown size={24} />,
      label: "Discounts",
      value: `₹${counts.discounts.toLocaleString("en-IN")}`,
      subtitle: "vs plan: +12%",
      color: "#ef4444",
      data: sparklineData,
    },
    {
      icon: <AlertCircle size={24} />,
      label: "Ads Running",
      value: counts.adsRunning,
      subtitle: "unauthorized",
      color: "#f59e0b",
      data: sparklineData.map((d) => ({ value: d.value * 0.8 })),
    },
    {
      icon: <TrendingDown size={24} />,
      label: "Profit Leakage",
      value: `₹${counts.profitLeakage.toLocaleString("en-IN")}`,
      subtitle: "estimated",
      color: "#dc2626",
      data: sparklineData.map((d) => ({ value: d.value * 1.2 })),
    },
    {
      icon: <Percent size={24} />,
      label: "Commission",
      value: `${counts.commission}%`,
      subtitle: "WoW trend",
      color: "#10b981",
      data: sparklineData.map((d) => ({ value: d.value * 0.6 })),
    },
  ];

  return (
    <section className="live-metrics-section">
      <div className="container">
        <motion.h2
          className="section-title"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          See Your Metrics in Real-Time
        </motion.h2>

        <motion.div
          className="metrics-grid"
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {metrics.map((metric, index) => (
            <motion.div
              key={index}
              className="metric-tile"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={
                prefersReducedMotion
                  ? {}
                  : {
                      y: -5,
                      boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                    }
              }
            >
              <div className="metric-header">
                <div className="metric-icon" style={{ color: metric.color }}>
                  {metric.icon}
                </div>
                <span className="metric-label">{metric.label}</span>
              </div>
              <div className="metric-value" style={{ color: metric.color }}>
                {metric.value}
              </div>
              <div className="metric-subtitle">{metric.subtitle}</div>
              <div className="metric-sparkline">
                <ResponsiveContainer width="100%" height={40}>
                  <LineChart data={metric.data}>
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={metric.color}
                      strokeWidth={2}
                      dot={false}
                      animationDuration={2000}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          className="view-full-analytics"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <button className="btn-secondary-cta">View Full Analytics →</button>
        </motion.div>
      </div>
    </section>
  );
};

export default LiveMetricsPreview;
