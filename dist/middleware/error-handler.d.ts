import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
export interface AppError extends Error {
    statusCode?: number;
    code?: string;
}
export declare function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void;
export declare function createError(message: string, statusCode?: number, code?: string): AppError;
//# sourceMappingURL=error-handler.d.ts.map