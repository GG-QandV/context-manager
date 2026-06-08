export interface ParsedTimeQuery {
    date_from?: Date;
    date_to?: Date;
    original_query: string;
}
export declare class TimeParserService {
    parse(query: string): ParsedTimeQuery;
    private startOfDayUTC;
    private endOfDayUTC;
}
export declare const timeParserService: TimeParserService;
//# sourceMappingURL=timeParser.service.d.ts.map