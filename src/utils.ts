import { spawn } from 'child_process';

export function getMasterTextTemplateLanguage(fileExt: string) {
    switch (fileExt) {
        case '.hs':
        case '.lhs':
            return 'haskell';
        case '.fs':
        case '.fth':
        case '.forth':
            return 'forth';
        case '.pp':
            return 'pascal';
        case '.html':
        case '.htm':
            return 'html';
        case '.md':
            return 'readme';
        default:
            return '';
    }
}

export interface CommandResult{
    code: number;
    signal: string;
    out: string[];
    err: string[];
}

export function runCommand(command: string, path?: string, stdout?: (data: string) => void, stderr?: (data: string) => void): Promise<CommandResult> {
    return new Promise(function (resolve, reject) {
        const options = {};
        if (path) {
            options['cwd'] = path;
        }
        if (process.platform === 'win32') {
            options['shell'] = 'powershell';
        }
        const child = spawn(command, options);
        const out = [];
        const err = [];
        child.stdout.on('data', data => {
            out.push(data.toString());
            if (stdout) stdout(data.toString());
        });
        child.stderr.on('data', data => {
            err.push(data.toString());
            if (stderr) stderr(data.toString());
        });
        child.stdin.end();
        child.on('error', (err: Error) => reject(err));
        child.on('exit', (code: number, signal: string) => resolve({ code, signal, out, err}));
    });
}