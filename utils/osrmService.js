const axios = require('axios');

/**
 * Enhanced OSRM (Open Source Routing Machine) Service
 * Provides accurate distance and duration calculations using real road networks
 * 
 * Features:
 * - Real road distance calculation with OSRM
 * - Travel time estimation
 * - Delivery zone validation
 * - Multiple warehouse support
 * - Automatic fallback to Haversine
 * - Retry logic for failed requests
 * - Comprehensive error handling
 */
class OSRMService {
    constructor() {
        this.baseUrl = process.env.OSRM_SERVER_URL || 'http://router.project-osrm.org';
        this.timeout = 15000; // 15 seconds timeout
        this.maxRetries = 2; // Retry failed requests
        this.fallbackToHaversine = true; // Enable fallback
        this.cache = new Map(); // Simple cache for repeated requests
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Validate coordinates
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {boolean} True if coordinates are valid
     */
    isValidCoordinate(lat, lng) {
        return (
            typeof lat === 'number' && 
            typeof lng === 'number' &&
            lat >= -90 && lat <= 90 &&
            lng >= -180 && lng <= 180 &&
            !isNaN(lat) && !isNaN(lng)
        );
    }

    /**
     * Create cache key for coordinates
     * @param {number} startLat 
     * @param {number} startLng 
     * @param {number} endLat 
     * @param {number} endLng 
     * @returns {string} Cache key
     */
    getCacheKey(startLat, startLng, endLat, endLng) {
        return `${startLat.toFixed(6)},${startLng.toFixed(6)}-${endLat.toFixed(6)},${endLng.toFixed(6)}`;
    }

    /**
     * Delay function for retry logic
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Calculate route between two points using OSRM with retry logic and caching
     * @param {number} startLat - Starting latitude
     * @param {number} startLng - Starting longitude
     * @param {number} endLat - Ending latitude
     * @param {number} endLng - Ending longitude
     * @param {number} retryCount - Current retry attempt
     * @returns {Promise<Object>} Route information with distance and duration
     */
    async calculateRoute(startLat, startLng, endLat, endLng, retryCount = 0) {
        try {
            // Validate coordinates
            if (!this.isValidCoordinate(startLat, startLng) || !this.isValidCoordinate(endLat, endLng)) {
                throw new Error('Invalid coordinates provided');
            }

            // Check cache first
            const cacheKey = this.getCacheKey(startLat, startLng, endLat, endLng);
            const cached = this.cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                console.log('OSRM: Using cached result');
                return { ...cached.data, cached: true };
            }

            const url = `${this.baseUrl}/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=false&alternatives=false&steps=false`;
            
            console.log(`OSRM Request (attempt ${retryCount + 1}):`, url);
            
            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'BazarXpress-Delivery/1.0',
                    'Accept': 'application/json'
                }
            });
            
            if (response.data.code === 'Ok' && response.data.routes && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                const result = {
                    distance: route.distance / 1000, // Convert to kilometers
                    duration: route.duration / 60,   // Convert to minutes
                    route: {
                        distance_meters: route.distance,
                        duration_seconds: route.duration,
                        geometry: route.geometry || null
                    },
                    fallback: false,
                    method: 'osrm',
                    server: this.baseUrl,
                    cached: false
                };
                
                // Cache the result
                this.cache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });
                
                console.log(`OSRM Success: ${result.distance.toFixed(2)}km, ${result.duration.toFixed(2)}min`);
                return result;
            } else {
                throw new Error(`OSRM API error: ${response.data.message || response.data.code || 'Unknown error'}`);
            }
        } catch (error) {
            console.error(`OSRM Service Error (attempt ${retryCount + 1}):`, error.message);
            
            // Retry logic for network errors
            if (retryCount < this.maxRetries && 
                (error.code === 'ECONNREFUSED' || 
                 error.code === 'ETIMEDOUT' || 
                 error.code === 'ENOTFOUND' ||
                 error.response?.status >= 500)) {
                
                const delayMs = (retryCount + 1) * 1000;
                console.log(`Retrying OSRM request in ${delayMs}ms...`);
                await this.delay(delayMs);
                return this.calculateRoute(startLat, startLng, endLat, endLng, retryCount + 1);
            }
            
            // Fallback to Haversine formula if enabled
            if (this.fallbackToHaversine) {
                console.log('Falling back to Haversine calculation');
                const distance = this.calculateHaversineDistance(startLat, startLng, endLat, endLng);
                const estimatedDuration = this.estimateDuration(distance);
                
                return {
                    distance,
                    duration: estimatedDuration,
                    route: {
                        distance_meters: distance * 1000,
                        duration_seconds: estimatedDuration * 60,
                        geometry: null
                    },
                    fallback: true,
                    method: 'haversine',
                    error: error.message,
                    server: 'fallback',
                    cached: false
                };
            } else {
                throw error;
            }
        }
    }

    /**
     * Calculate distance matrix for multiple destinations from one origin
     * Useful for finding the nearest warehouse
     * @param {number} originLat - Origin latitude
     * @param {number} originLng - Origin longitude
     * @param {Array} destinations - Array of {lat, lng} destinations
     * @returns {Promise<Array>} Array of distance/duration results
     */
    async calculateDistanceMatrix(originLat, originLng, destinations) {
        try {
            if (!destinations || destinations.length === 0) {
                throw new Error('No destinations provided');
            }

            // Validate origin coordinates
            if (!this.isValidCoordinate(originLat, originLng)) {
                throw new Error('Invalid origin coordinates');
            }

            // For OSRM, we need to make individual requests for each destination
            // In production, you might want to use the table service for better performance
            const results = [];
            
            for (let i = 0; i < destinations.length; i++) {
                const dest = destinations[i];
                
                if (!this.isValidCoordinate(dest.lat, dest.lng)) {
                    console.warn(`Skipping invalid destination coordinates: ${dest.lat}, ${dest.lng}`);
                    results.push({
                        index: i,
                        distance: Infinity,
                        duration: Infinity,
                        error: 'Invalid coordinates',
                        fallback: true,
                        method: 'error'
                    });
                    continue;
                }

                try {
                    const result = await this.calculateRoute(originLat, originLng, dest.lat, dest.lng);
                    results.push({
                        index: i,
                        ...result
                    });
                } catch (error) {
                    console.error(`Error calculating route to destination ${i}:`, error.message);
                    results.push({
                        index: i,
                        distance: Infinity,
                        duration: Infinity,
                        error: error.message,
                        fallback: true,
                        method: 'error'
                    });
                }
            }

            return results;
        } catch (error) {
            console.error('Distance matrix calculation error:', error.message);
            throw error;
        }
    }

    /**
     * Find the nearest warehouse to a customer location
     * @param {number} customerLat - Customer latitude
     * @param {number} customerLng - Customer longitude
     * @param {Array} warehouses - Array of warehouse objects with location.lat and location.lng
     * @returns {Promise<Object>} Nearest warehouse with distance information
     */
    async findNearestWarehouse(customerLat, customerLng, warehouses) {
        try {
            if (!warehouses || warehouses.length === 0) {
                throw new Error('No warehouses provided');
            }

            console.log(`Finding nearest warehouse for customer at ${customerLat}, ${customerLng}`);
            console.log(`Checking ${warehouses.length} warehouses`);

            const destinations = warehouses.map(warehouse => ({
                lat: warehouse.location.lat,
                lng: warehouse.location.lng
            }));

            const results = await this.calculateDistanceMatrix(customerLat, customerLng, destinations);
            
            // Find the warehouse with minimum distance
            let nearestWarehouse = null;
            let minDistance = Infinity;
            let nearestResult = null;

            results.forEach((result, index) => {
                if (result.distance < minDistance) {
                    minDistance = result.distance;
                    nearestWarehouse = warehouses[index];
                    nearestResult = result;
                }
            });

            if (!nearestWarehouse) {
                throw new Error('No accessible warehouse found');
            }

            console.log(`Nearest warehouse: ${nearestWarehouse.name} at ${minDistance.toFixed(2)}km`);

            return {
                warehouse: nearestWarehouse,
                distance: nearestResult.distance,
                duration: nearestResult.duration,
                route: nearestResult.route,
                method: nearestResult.method,
                fallback: nearestResult.fallback
            };
        } catch (error) {
            console.error('Error finding nearest warehouse:', error.message);
            throw error;
        }
    }

    /**
     * Check if delivery is available to a location from a warehouse
     * @param {number} warehouseLat - Warehouse latitude
     * @param {number} warehouseLng - Warehouse longitude
     * @param {number} customerLat - Customer latitude
     * @param {number} customerLng - Customer longitude
     * @param {number} maxDeliveryRadius - Maximum delivery radius in km
     * @returns {Promise<Object>} Delivery availability information
     */
    async checkDeliveryAvailability(warehouseLat, warehouseLng, customerLat, customerLng, maxDeliveryRadius) {
        try {
            const result = await this.calculateRoute(warehouseLat, warehouseLng, customerLat, customerLng);
            
            const isAvailable = result.distance <= maxDeliveryRadius;
            
            return {
                available: isAvailable,
                distance: result.distance,
                duration: result.duration,
                maxRadius: maxDeliveryRadius,
                method: result.method,
                fallback: result.fallback,
                route: result.route
            };
        } catch (error) {
            console.error('Error checking delivery availability:', error.message);
            throw error;
        }
    }

    /**
     * Calculate Haversine distance between two points (fallback method)
     * @param {number} lat1 - First point latitude
     * @param {number} lng1 - First point longitude
     * @param {number} lat2 - Second point latitude
     * @param {number} lng2 - Second point longitude
     * @returns {number} Distance in kilometers
     */
    calculateHaversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     * @param {number} degrees - Degrees to convert
     * @returns {number} Radians
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Estimate duration based on distance (fallback method)
     * Assumes average speed of 30 km/h in urban areas
     * @param {number} distance - Distance in kilometers
     * @returns {number} Estimated duration in minutes
     */
    estimateDuration(distance) {
        const averageSpeed = 30; // km/h
        return (distance / averageSpeed) * 60; // Convert to minutes
    }

    /**
     * Check OSRM server health
     * @returns {Promise<Object>} Server health status
     */
    async checkHealth() {
        try {
            // Test with a simple route in Delhi area
            const testResult = await this.calculateRoute(28.6139, 77.2090, 28.6139, 77.2090);
            
            return {
                available: true,
                server: this.baseUrl,
                method: testResult.method,
                fallback: testResult.fallback,
                responseTime: testResult.duration || 0
            };
        } catch (error) {
            return {
                available: false,
                server: this.baseUrl,
                error: error.message,
                fallback: this.fallbackToHaversine
            };
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('OSRM cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            timeout: this.cacheTimeout,
            entries: Array.from(this.cache.keys())
        };
    }
}

// Create and export singleton instance
const osrmService = new OSRMService();
module.exports = osrmService;