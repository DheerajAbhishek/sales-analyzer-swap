import { restaurantService } from './api.js'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://your-api-gateway-url.amazonaws.com/prod'

class AuthService {
    async login(businessEmail, password) {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ businessEmail, password })
            })

            const data = await response.json()

            if (response.ok) {
                // Store auth data
                localStorage.setItem('user', JSON.stringify(data.user))
                localStorage.setItem('token', data.token)

                // Fetch user restaurants after successful login
                try {
                    const restaurantData = await restaurantService.getUserRestaurants(data.user.businessEmail)
                    console.log('User restaurants fetched:', restaurantData)

                    // Store restaurant data in localStorage for quick access
                    localStorage.setItem('userRestaurants', JSON.stringify(restaurantData))

                    return {
                        success: true,
                        user: data.user,
                        token: data.token,
                        restaurants: restaurantData
                    }
                } catch (restaurantError) {
                    console.warn('Failed to fetch user restaurants:', restaurantError)
                    // Don't fail login if restaurant fetch fails
                    return {
                        success: true,
                        user: data.user,
                        token: data.token,
                        restaurants: { restaurantIds: [], objectKeysCount: 0 }
                    }
                }
            } else {
                return {
                    success: false,
                    message: data.message || 'Login failed'
                }
            }
        } catch (error) {
            console.error('Login error:', error)
            return {
                success: false,
                message: 'Network error occurred'
            }
        }
    }

    async signup(userData) {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            })

            const data = await response.json()

            if (response.ok) {
                return {
                    success: true,
                    message: data.message || 'Account created successfully'
                }
            } else {
                return {
                    success: false,
                    message: data.message || 'Signup failed'
                }
            }
        } catch (error) {
            console.error('Signup error:', error)
            return {
                success: false,
                message: 'Network error occurred'
            }
        }
    }

    async verifyToken(token) {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            })

            const data = await response.json()

            if (response.ok) {
                // Fetch user restaurants after successful token verification
                try {
                    const restaurantData = await restaurantService.getUserRestaurants(data.user.businessEmail)
                    console.log('User restaurants refreshed:', restaurantData)

                    // Update stored restaurant data
                    localStorage.setItem('userRestaurants', JSON.stringify(restaurantData))

                    return {
                        success: true,
                        user: data.user,
                        restaurants: restaurantData
                    }
                } catch (restaurantError) {
                    console.warn('Failed to refresh user restaurants:', restaurantError)
                    // Don't fail verification if restaurant fetch fails
                    return {
                        success: true,
                        user: data.user,
                        restaurants: JSON.parse(localStorage.getItem('userRestaurants') || '{"restaurantIds":[],"objectKeysCount":0}')
                    }
                }
            } else {
                return {
                    success: false,
                    message: data.message || 'Token verification failed'
                }
            }
        } catch (error) {
            console.error('Token verification error:', error)
            return {
                success: false,
                message: 'Network error occurred'
            }
        }
    }

    logout() {
        localStorage.removeItem('user')
        localStorage.removeItem('token')
        localStorage.removeItem('userRestaurants')
    }

    getCurrentUser() {
        const user = localStorage.getItem('user')
        return user ? JSON.parse(user) : null
    }

    getToken() {
        return localStorage.getItem('token')
    }

    isAuthenticated() {
        return !!this.getToken()
    }

    getUserRestaurants() {
        const restaurants = localStorage.getItem('userRestaurants')
        return restaurants ? JSON.parse(restaurants) : { restaurantIds: [], objectKeysCount: 0 }
    }
}

export const authService = new AuthService()