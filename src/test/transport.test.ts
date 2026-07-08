import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import { SdkTransport } from '../transport';

describe('SdkTransport', () => {
    let transport: SdkTransport;

    beforeEach(() => {
        transport = new SdkTransport('test-module', {});
    })

    afterEach(() => {
        transport.stop()
    })

    it('start() should not crash outside browser', () => {
        const orgWindow =  globalThis.window;

        delete (globalThis as any).window;
        expect(() => transport.start()).not.toThrow();
        (globalThis as any).window = orgWindow;
    })

    // if('')
})