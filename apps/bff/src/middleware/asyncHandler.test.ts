import { describe, it, expect, vi } from 'vitest';
import { asyncHandler } from './asyncHandler.js';
import type { Request, Response, NextFunction } from 'express';

describe('asyncHandler middleware', () => {
    it('calls the next function with an error if the async handler throws', async () => {
        const error = new Error('Async error');
        const slowHandler = async () => {
            throw error;
        };

        const req = {} as Request;
        const res = {} as Response;
        const next = vi.fn() as NextFunction;

        const wrapped = asyncHandler(slowHandler);
        await wrapped(req, res, next);

        expect(next).toHaveBeenCalledWith(error);
    });

    it('resolves successfully if the async handler does not throw', async () => {
        const handler = async (req: Request, res: Response) => {
            res.status(200).send('OK');
        };

        const req = {} as Request;
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        const wrapped = asyncHandler(handler);
        await wrapped(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });
});
