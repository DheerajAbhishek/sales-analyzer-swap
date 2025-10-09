import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LoginForm from './LoginForm'
import SignupForm from './SignupForm'

const AuthPage = ({ onAuthSuccess }) => {
    const location = useLocation()
    const navigate = useNavigate()
    const [isLogin, setIsLogin] = useState(true)

    useEffect(() => {
        // Set initial state based on URL
        setIsLogin(location.pathname === '/login')
    }, [location.pathname])

    const handleTabChange = (isLoginTab) => {
        setIsLogin(isLoginTab)
        navigate(isLoginTab ? '/login' : '/signup')
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>Sales Dashboard</h1>
                    <p>Welcome to your analytics platform</p>
                </div>

                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${isLogin ? 'active' : ''}`}
                        onClick={() => handleTabChange(true)}
                    >
                        Login
                    </button>
                    <button
                        className={`auth-tab ${!isLogin ? 'active' : ''}`}
                        onClick={() => handleTabChange(false)}
                    >
                        Sign Up
                    </button>
                </div>

                <div className="auth-form-container">
                    {isLogin ? (
                        <LoginForm onSuccess={onAuthSuccess} />
                    ) : (
                        <SignupForm onSuccess={() => handleTabChange(true)} />
                    )}
                </div>

                <div className="auth-footer">
                    <p>
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            className="auth-link"
                            onClick={() => handleTabChange(!isLogin)}
                        >
                            {isLogin ? 'Sign up' : 'Login'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default AuthPage