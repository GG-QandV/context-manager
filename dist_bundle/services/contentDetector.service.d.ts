export type ContentType = 'code' | 'command' | 'list' | 'table' | 'error' | 'text';
export declare class ContentDetectorService {
    detectTypes(content: string): ContentType[];
}
export declare const contentDetector: ContentDetectorService;
//# sourceMappingURL=contentDetector.service.d.ts.map