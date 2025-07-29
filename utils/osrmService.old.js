const axios = require('axios');

/**
 * OSRM (Open Source Routing Machine) Service
 * Provides accurate distance and duration calculations using real road networks
 * 
 * Features:
 * - Real road distance calculation
 * - Travel time estimation
 * - Delivery zone validation
 * - Multiple warehouse support
 * - Automatic fallback to Haversine
 */
class OSRMService {
    constructor() {
        // Use public OSRM demo server if local server is not available
        // You can change this to your hosted instance later
        this.baseUrl = process.env.OSRM_SERVER_URL || 'http://router.project-osrm.org';
        this.timeout = 15000; // 15 seconds timeout for public server
        this.maxRetries = 2; // Retry failed requests
        this.fallbackToHaversine = true; // Enable fallback
    }

    /**
     * Calculate route distance and duration between two points
     * @param {number} startLat - Starting latitude
     * @param {number} startLng - Starting longitude
     * @param {number} endLat - Ending latitude
     * @param {number} endLng - Ending longitude
     * @returns {Promise<{distance: number, duration: number, route: object}>}
     */
    async calculateRoute(startLat, startLng, endLat, endLng) {
        try {
            const url = `${this.baseUrl}/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=false&alternatives=false&steps=false`;
            
            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.code !== 'Ok') {
                throw new Error(`OSRM API error: ${response.data.message || 'Unknown error'}`);
            }

            const route = response.data.routes[0];
            
            return {
                distance: route.distance / 1000, // Convert meters to kilometers
                duration: route.duration / 60, // Convert seconds to minutes
                route: {
                    distance_meters: route.distance,
                    duration_seconds: route.duration,
                    geometry: route.geometry || null
                }
            };
        } catch (error) {
            console.error('OSRM Service Error:', error.message);
            
            // Fallback to Haversine formula if OSRM is not available
            console.warn('Falling back to Haversine formula for distance calculation');
            const distance = this.calculateHaversineDistance(startLat, startLng, endLat, endLng);
            
            return {
                distance: distance,
                duration: this.estimateDurationFromDistance(distance),
                route: {
                    distance_meters: distance * 1000,
                    duration_seconds: this.estimateDurationFromDistance(distance) * 60,
                    geometry: null,
                    fallback: true
                }
            };
        }
    }

    /**
     * Calculate distance matrix for multiple origins and destinations
     * @param {Array} origins - Array of {lat, lng} objects
     * @param {Array} destinations - Array of {lat, lng} objects
     * @returns {Promise<Array>} Matrix of distances and durations
     */
    async calculateMatrix(origins, destinations) {
        try {
            const originCoords = origins.map(o => `${o.lng},${o.lat}`).join(';');
            const destCoords = destinations.map(d => `${d.lng},${d.lat}`).join(';');
            
            const url = `${this.baseUrl}/table/v1/driving/${originCoords};${destCoords}?sources=0&destinations=1`;
            
            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.code !== 'Ok') {
                throw new Error(`OSRM API error: ${response.data.message || 'Unknown error'}`);
            }

            const distances = response.data.distances[0]; // First origin to all destinations
            const durations = response.data.durations[0]; // First origin to all destinations
            
            return destinations.map((dest, index) => ({
                destination: dest,
                distance: distances[index] / 1000, // Convert to km
                duration: durations[index] / 60, // Convert to minutes
                fallback: false
            }));
        } catch (error) {
            console.error('OSRM Matrix Service Error:', error.message);
            
            // Fallback to Haversine calculations
            console.warn('Falling back to Haversine formula for matrix calculation');
            const origin = origins[0]; // Use first origin
            
            return destinations.map(dest => {
                const distance = this.calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
                return {
                    destination: dest,
                    distance: distance,
                    duration: this.estimateDurationFromDistance(distance),
                    fallback: true
                };
            });
        }
    }

    /**
     * Find the nearest warehouse to a customer location
     * @param {number} customerLat - Customer latitude
     * @param {number} customerLng - Customer longitude
     * @param {Array} warehouses - Array of warehouse objects with location data
     * @returns {Promise<{warehouse: object, distance: number, duration: number}>}
     */
    async findNearestWarehouse(customerLat, customerLng, warehouses) {
        try {
            const warehouseLocations = warehouses.map(w => ({
                lat: w.location.lat,
                lng: w.location.lng
            }));

            const results = await this.calculateMatrix(
                [{ lat: customerLat, lng: customerLng }],
                warehouseLocations
            );

            let nearestWarehouse = null;
            let minDistance = Infinity;
            let bestResult = null;

            results.forEach((result, index) => {
                if (result.distance < minDistance) {
                    minDistance = result.distance;
                    nearestWarehouse = warehouses[index];
                    bestResult = result;
                }
            });

            return {
                warehouse: nearestWarehouse,
                distance: bestResult.distance,
                duration: bestResult.duration,
                fallback: bestResult.fallback
            };
        } catch (error) {
            console.error('Error finding nearest warehouse:', error.message);
            throw error;
        }
    }

    /**
     * Haversine formula fallback for distance calculation
     * @param {number} lat1 - First point latitude
     * @param {number} lng1 - First point longitude
     * @param {number} lat2 - Second point latitude
     * @param {number} lng2 - Second point longitude
     * @returns {number} Distance in kilometers
     */
    calculateHaversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Estimate duration from distance (fallback method)
     * @param {number} distance - Distance in kilometers
     * @returns {number} Estimated duration in minutes
     */
    estimateDurationFromDistance(distance) {
        // Assume average speed of 30 km/h in urban areas
        const averageSpeed = 30; // km/h
        return (distance / averageSpeed) * 60; // Convert to minutes
    }

    /**
     * Check if OSRM server is available
     * @returns {Promise<boolean>}
     */
    async isServerAvailable() {
        try {
            const response = await axios.get(`${this.baseUrl}/route/v1/driving/77.2090,28.6139;77.2090,28.6139`, {
                timeout: 5000
            });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get server status and information
     * @returns {Promise<object>}
     */
    async getServerStatus() {
        try {
            const isAvailable = await this.isServerAvailable();
            return {
                available: isAvailable,
                baseUrl: this.baseUrl,
                timeout: this.timeout,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                available: false,
                baseUrl: this.baseUrl,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = new OSRMService();