"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRedisConnection = void 0;
const DEFAULT_REDIS_PORT = 6379;
const buildRedisOptionsFromUrl = (redisUrl) => {
    const url = new URL(redisUrl);
    const options = {
        host: url.hostname,
        port: url.port ? Number(url.port) : DEFAULT_REDIS_PORT,
    };
    if (url.username) {
        options.username = url.username;
    }
    if (url.password) {
        options.password = url.password;
    }
    if (url.pathname && url.pathname !== '/') {
        const db = Number(url.pathname.replace('/', ''));
        if (!Number.isNaN(db)) {
            options.db = db;
        }
    }
    if (url.protocol === 'rediss:') {
        options.tls = {};
    }
    return options;
};
const createRedisConnection = (configService) => {
    const redisUrl = configService.get('REDIS_URL');
    if (redisUrl) {
        return buildRedisOptionsFromUrl(redisUrl);
    }
    return {
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get('REDIS_PORT', DEFAULT_REDIS_PORT),
        password: configService.get('REDIS_PASSWORD'),
    };
};
exports.createRedisConnection = createRedisConnection;
//# sourceMappingURL=redis.connection.js.map