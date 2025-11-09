import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Lock, TrendingUp, TrendingDown } from "lucide-react";

const Hero = ({ user, onGoToDashboard, onConnectGmail }) => {
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const phrases = ["discount leakage", "ad overspend", "commission creep"];

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Cycle through phrases
  useEffect(() => {
    if (prefersReducedMotion) return;

    const interval = setInterval(() => {
      setCurrentPhrase((prev) => (prev + 1) % phrases.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  const handleCTAClick = () => {
    if (user) {
      onGoToDashboard();
    } else {
      onConnectGmail();
    }
  };

  return (
    <section className="hero-new">
      <div className="hero-container-new">
        <motion.div
          className="hero-content-new"
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <h1 className="hero-title-new">
            Are Your <span className="swiggy">Swiggy</span> &{" "}
            <span className="zomato">Zomato</span> Discounts{" "}
            <span className="hero-highlight-new">Eating Your Profits?</span>
          </h1>

          <div className="typewriter-container">
            <span className="typewriter-prefix">Stop losing money to: </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={currentPhrase}
                className="typewriter-phrase"
                initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.5 }}
              >
                {phrases[currentPhrase]}
              </motion.span>
            </AnimatePresence>
          </div>

          <p className="hero-description-new">
            Connect your Gmail once — instantly see if your ad spends and
            discount budgets are under control.{" "}
            <strong>No manual uploads.</strong>
          </p>

          <div className="hero-actions-new">
            <button
              className="btn-primary-new"
              onClick={handleCTAClick}
              aria-label={user ? "Go to Dashboard" : "Start Free Trial"}
            >
              {user ? "Go to Dashboard" : "Start Free Trial"}
            </button>
          </div>

          <div className="trust-row">
            <div className="trust-item">
              <Shield size={16} />
              <span>Google OAuth</span>
            </div>
            <div className="trust-divider">•</div>
            <div className="trust-item">
              <Lock size={16} />
              <span>Read-only access</span>
            </div>
            <div className="trust-divider">•</div>
            <div className="trust-item">
              <Shield size={16} />
              <span>Data encrypted</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="hero-visual-new"
          initial={prefersReducedMotion ? {} : { opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.8,
            delay: 0.2,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <div className="platform-showcase">
            <motion.img
              src="/Swiggy.jpeg"
              alt="Swiggy"
              className="showcase-logo showcase-logo-1"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: -20 }}
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      y: [0, -20, 0],
                      x: [0, 10, 0],
                      rotate: [0, 2, 0, -2, 0],
                    }
              }
              transition={{
                opacity: { duration: 0.6, delay: 0.4 },
                y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                x: { duration: 3, repeat: Infinity, ease: "easeInOut" },
                rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" },
              }}
            />

            <motion.img
              src="/zomato.png"
              alt="Zomato"
              className="showcase-logo showcase-logo-2"
              initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      y: [0, 15, 0],
                      x: [0, -15, 0],
                      rotate: [0, -3, 0, 3, 0],
                    }
              }
              transition={{
                opacity: { duration: 0.6, delay: 0.5 },
                y: {
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5,
                },
                x: {
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.3,
                },
                rotate: {
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.2,
                },
              }}
            />

            {/* Stock Up Symbol */}
            <motion.div
              className="stock-symbol stock-up"
              initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0 }}
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: [0.7, 1, 0.7],
                      scale: [1, 1.1, 1],
                      y: [0, -15, 0],
                      x: [0, 8, 0],
                    }
              }
              transition={{
                opacity: { duration: 0.5, delay: 0.6 },
                scale: { duration: 3, repeat: Infinity, ease: "easeInOut" },
                y: {
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.2,
                },
                x: {
                  duration: 3.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.4,
                },
              }}
            >
              <TrendingUp size={40} strokeWidth={2.5} />
            </motion.div>

            {/* Stock Down Symbol */}
            <motion.div
              className="stock-symbol stock-down"
              initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0 }}
              animate={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : {
                      opacity: [0.7, 1, 0.7],
                      scale: [1, 1.15, 1],
                      y: [0, 12, 0],
                      x: [0, -10, 0],
                    }
              }
              transition={{
                opacity: { duration: 0.5, delay: 0.7 },
                scale: {
                  duration: 3.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.3,
                },
                y: {
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.6,
                },
                x: {
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.1,
                },
              }}
            >
              <TrendingDown size={40} strokeWidth={2.5} />
            </motion.div>

            {/* Animated Search Lens */}
            <motion.div
              className="search-lens"
              animate={
                prefersReducedMotion
                  ? {}
                  : {
                      x: [20, 200, 350, 200, 350, 20, 20],
                      y: [20, 50, 20, 200, 200, 150, 20],
                    }
              }
              transition={{
                duration: 12,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <div className="lens-circle">
                <div className="lens-glass"></div>
              </div>
              <div className="lens-handle"></div>
            </motion.div>

            {/* Scanning effect */}
            <motion.div
              className="scan-line"
              animate={
                prefersReducedMotion
                  ? {}
                  : {
                      y: [0, 350, 0],
                      opacity: [0, 0.8, 0.5, 0.8, 0],
                    }
              }
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </div>
        </motion.div>
      </div>

      <motion.div
        className="demo-banner"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <p className="demo-text">
          Not sure where to start? Book a free demo with our team
        </p>
        <a
          href="https://calendly.com/dheerajabhishek111/30min"
          target="_blank"
          rel="noopener noreferrer"
          className="demo-button"
        >
          Book a Free Demo
        </a>
      </motion.div>
    </section>
  );
};

export default Hero;
