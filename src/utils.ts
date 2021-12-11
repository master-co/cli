import { ChildProcess, exec } from 'child_process';
import * as os from 'os';

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
    result: string[];
    error: string[];
}

export function runCommand(command: string, path?: string, log: boolean = false): Promise<CommandResult> {
    let child: ChildProcess;
    if (!path) {
        path = os.homedir();
    }
    if (process.platform === 'win32') {
        child = exec(`${command}`, { shell: 'powershell', cwd: path });
    } else {
        child = exec(`${command}`, { cwd: path });
    }

    return new Promise(function (resolve, reject) {
        const result = [];
        const error = [];
        child.stdout.on('data', data => {
            result.push(data);
            if (log) {
                console.log(data);
            }
        });
        child.stderr.on('data', data => {
            error.push(data);
            if (log) {
                console.log(data);
            }
        });
        child.stdin.end();
        child.addListener('error', (err: Error) => reject(err));
        child.addListener('exit', (code: number, signal: string) => resolve({ code, signal, result, error}));
    });
}