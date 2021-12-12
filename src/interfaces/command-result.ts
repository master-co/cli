export interface CommandResult{
    code: number;
    signal: string;
    out: string[];
    err: string[];
}