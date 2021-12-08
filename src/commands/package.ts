import { Command, flags } from '@oclif/command';
import { CommandResult, runCommand } from '../utils';
import { exec } from 'child_process';
import * as Listr from 'Listr';
import * as writeJson from 'write-json';
import * as path from 'path';
import * as inquirer from 'inquirer';

const prompt = inquirer.createPromptModule();

export default class Package extends Command {
    static description = 'master package'
    static aliases = ['p']
    static examples = [
        `$ m package new PACKAGE_NAME`,
        `$ m package new PACKAGE_NAME --css --org ORGANIZATION`,
        `$ m package new PACKAGE_NAME --util --user USERNAME`,
    ]

    static flags = {
        help: flags.help({ char: 'h', hidden: true }),
        css: flags.boolean({ char: 'c', description: 'generate a css package', exclusive: ['util'] }),
        util: flags.boolean({ char: 'u', description: 'generate a util package', exclusive: ['css'] }),
        org: flags.string({
            char: 'o',
            description: 'create github organization package',
            exclusive: ['user']
        }),
        user: flags.string({
            char: 'p',
            description: 'create github personal package',
            exclusive: ['org']
        })
    }

    static args = [
        {
            name: 'new',
            required: true,
            options: ['new', 'n']
        },
        {
            name: 'PACKAGE_NAME',
            required: true
        }
    ]

    async run() {
        const { args, flags } = this.parse(Package);
        
        const questions = [];
        if (!flags.css && !flags.util) {
            // 如沒給 --css 或 --util
            questions.push({
                type: 'list',
                name: 'model',
                message: `What's your package model?`,
                choices: [
                    {
                        name: 'standard',
                        value: 'standard',
                    },
                    {
                        name: 'util (utility, function, class, etc.)',
                        value: 'js',
                    },
                    {
                        name: 'css (style, theme, color, etc.)',
                        value: 'css',
                    },
                ],
            });
        }
        if (!flags.org && !flags.user) {
            // 如沒給 --org 或 --user
            questions.push({
                type: 'list',
                name: 'kind',
                message: `What's kind of your package?`,
                choices: ['organization', 'personal'],
            });
            questions.push({
                type: 'input',
                name: 'org',
                message: 'Enter your organization name',
                default: 'master-style',
                when(answers) {
                    return answers.kind == 'organization';
                },
            });
            questions.push({
                type: 'input',
                name: 'user',
                message: 'Enter your username name',
                when(answers) {
                    return answers.kind == 'personal';
                },
            });
        }
        questions.push({
            type: 'input',
            name: 'npmPackageName',
            message: 'npm package name',
            default: `@master/${args.PACKAGE_NAME}`
        });
        questions.push({
            type: 'input',
            name: 'npmPackageLicense',
            message: 'npm package license',
            default: 'MIT'
        });
        const answers: any = await prompt(questions);

        const branch = answers.model ? answers.model : (flags.css ? 'css' : (flags.util ? 'js' : 'standard'));
        const kind = answers.kind ? answers.kind : (flags.user ? 'personal' : 'organization');
        const accountName = answers.user ? answers.user : (answers.org ? answers.org : (flags.user ? flags.user : flags.org));
        const packageJson = {
            name: answers.npmPackageName,
            license: answers.npmPackageLicense,
            main: branch === 'css' ? 'index.css' : 'index.js',
            private: false,
            repository: {
                type: "git",
                url: `https://github.com/${accountName}/${args.PACKAGE_NAME}.git`
            }
        }
        if (branch === 'js') {
            packageJson['types'] = 'index.d.ts';
        }

        const tasks = new Listr([
            // Clone package
            {
                title: 'Clone package',
                task: () => runCommand(`git clone -b ${branch} https://github.com/master-style/package.git ${args.PACKAGE_NAME}`, process.cwd()).then(result => {
                    if (result.code !== 0 && result.error.length > 0) {
                        throw new Error(result.error.join(''));
                    }
                })
            },
            // Reset package remote
            {
                title: 'Reset cloned to package origin',
                task: () => {
                    return new Listr([
                        // Remote remove origin
                        {
                            title: 'Remote remove origin',
                            task: (_, task) => runCommand(`git remote remove origin`, path.join(process.cwd(), args.PACKAGE_NAME)).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    task.skip(result.error.join(''));
                                }
                            })
                        },
                        // Remote add package
                        {
                            title: 'Remote add package',
                            task: (_, task) => runCommand(`git remote add package https://github.com/master-style/package.git`, path.join(process.cwd(), args.PACKAGE_NAME)).then(result => {
                                if (result.error.length > 0) {
                                    task.skip(result.error.join(''));
                                }
                            })
                        }
                    ]);
                }
            },
            // Write src package.json and commit
            {
                title: 'Write src package.json and commit',
                task: () => {
                    return new Listr([
                        // Checkout to main
                        {
                            title: 'Checkout to main',
                            task: (_, task) => runCommand(`git checkout -b main`, path.join(process.cwd(), args.PACKAGE_NAME)).then(result => {
                                if (result.code !== 0) {
                                    task.skip(result.error.join(''));
                                }
                            })
                        },
                        // Write src/package.json
                        {
                            title: 'Write src/package.json',
                            task: () => {
                                return new Promise<void>((resolve, reject) => {
                                    writeJson(path.join(process.cwd(), args.PACKAGE_NAME, 'src', 'package.json'), packageJson, err => {
                                        if (err) {
                                            reject(err);
                                        }
                                        resolve();
                                    });
                                })
                            }
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: (_, task) => runCommand(`git add src/package.json`, path.join(process.cwd(), args.PACKAGE_NAME)).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    task.skip(result.error.join(''));
                                }
                            })
                        },
                        // Git commit
                        {
                            title: 'Git commit',
                            task: (_, task) => runCommand(`git commit -m package.json`, path.join(process.cwd(), args.PACKAGE_NAME)).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    throw new Error(result.error.join(''));
                                }
                            })
                        }
                    ]);
                }
            },
            // Create github repository with GitHub CLI
            {
                title: 'Create github repository with GitHub CLI',
                task: () => {
                    return new Listr([
                        // Check github cli installed
                        {
                            title: 'Check github cli installed',
                            task: (ctx, task) => runCommand('gh')
                                .then(() => ctx.gh = true )
                                .catch(() => {
                                    ctx.gh = false;
                                    task.skip('GitHub CLI not available');
                                })
                        },
                        // Check auth status
                        {
                            title: 'Check auth status',
                            skip: ctx => ctx.gh === false,
                            task: (ctx, task) => runCommand('gh auth status').then(result => {
                                if (result.error.length > 0 && result.error[0].startsWith('You are not logged into any GitHub hosts')) {
                                    ctx.ghLogin = false;
                                    task.skip(result.error.join('\n'));
                                } else {
                                    ctx.ghLogin = true;
                                }
                            })
                        },
                        // Login
                        {
                            title: 'Login',
                            enabled: ctx => ctx.ghLogin === false,
                            skip: ctx => ctx.gh === false,
                            task: (ctx, task) => (new Promise<CommandResult>(function (resolve, reject) {
                                const child = exec(`gh auth login -w`);

                                const result = [];
                                const error = [];
                                const codeRegex = /[A-Z0-9]{4}-[A-Z0-9]{4}/g;

                                child.stdout.on('data', (data: string) => {
                                    result.push(data);
                                    const match = data.match(codeRegex);
                                    if (match && match.length > 0) {
                                        task.output = `Your one-time code: ${match.pop()}`;
                                    }
                                });
                                child.stderr.on('data', data => {
                                    error.push(data);
                                    const match = data.match(codeRegex);
                                    if (match && match.length > 0) {
                                        task.output = `Your one-time code: ${match.pop()}`;
                                    }
                                });
                                
                                child.stdin.end();
                                child.addListener('error', (err: Error) => reject(err));
                                child.addListener('exit', (code: number, signal: string) => resolve({ code, signal, result, error }));
                            })).then(result => {
                                if (result.code !== 0) {
                                    ctx.ghLogin = false;
                                    throw new Error(result.error.join(''));
                                } else {
                                    ctx.ghLogin = true;
                                }
                            })
                        },
                        // Create repository
                        {
                            title: 'Create repository',
                            skip: ctx => ctx.gh === false,
                            task: (ctx, task) => {
                                if (kind === 'personal') {
                                    return runCommand(`gh repo create ${args.PACKAGE_NAME} --public`)
                                        .then(result => {
                                            if (result.code !== 0 && result.error.length > 0 ) {
                                                ctx.ghRepoCreated = false;
                                                task.skip(result.error.join(''));
                                            } else {
                                                ctx.ghRepoCreated = true;
                                            }
                                        });
                                } else {
                                    return runCommand(`gh repo create ${accountName}/${args.PACKAGE_NAME} --public`)
                                        .then(result => {
                                            if (result.code !== 0 && result.error.length > 0) {
                                                ctx.ghRepoCreated = false;
                                                task.skip(result.error.join(''));
                                            } else {
                                                ctx.ghRepoCreated = true;
                                            }
                                        });
                                }
                            }
                        },
                        // Remote add origin
                        {
                            title: 'Remote add origin',
                            skip: ctx => ctx.ghRepoCreated !== true,
                            task: (ctx, task) => runCommand(`git remote add origin https://github.com/${accountName}/${args.PACKAGE_NAME}.git`, path.join(process.cwd(), args.PACKAGE_NAME)).then(result => {
                                if (result.code !== 0 && result.error.length > 0) {
                                    ctx.remoteAdded = false;
                                    task.skip(result.error.join(''));
                                } else {
                                    ctx.remoteAdded = true;
                                }
                            })
                        }
                    ]);
                }
            },
            // Push new package to github repository
            {
                title: 'Push new package to github repository',
                skip: ctx => ctx.remoteAdded !== true,
                task: (_, task) => runCommand(`git push origin main`, path.join(process.cwd(), args.PACKAGE_NAME)).then(result => {
                    if (result.code !== 0) {
                        task.skip(result.error.join(''));
                    }
                })
            }
        ]);

        tasks.run()
        .catch(err => {
            console.error(err);
        });
    }
}
