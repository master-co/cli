import { Command, flags } from '@oclif/command';
import { getTextTemplateLanguage } from '../utils/get-text-template-language';
import { TextTemplate } from '@master/text-template';
import { promises as fs } from 'fs';
import * as Listr from 'listr';
import * as writeJson from 'writejson';
import * as readJson from 'readjson';
import * as path from 'path';
import * as os from 'os';
import * as inquirer from 'inquirer';
import * as execa from 'execa';
import { getConfig } from '../utils/get-config';
import { saveConfig } from '../utils/save-config';

const prompt = inquirer.createPromptModule();

export default class Package extends Command {
    static description = 'master package'
    static aliases = ['p']
    static examples = [
        `$ m package new PACKAGE_NAME`,
        `$ m package new PACKAGE_NAME --css --org ORGANIZATION`,
        `$ m package new PACKAGE_NAME --util --user USERNAME`,
        `------`,
        `$ m package render README.md --data master.json`,
    ]

    static flags = {
        help: flags.help({ char: 'h', hidden: true }),

        // new
        model: flags.string({
            char: 'm',
            description: 'According to which model to build the package',
            options: ['standard', 'css', 'util', 'class']
        }),
        'gh-org': flags.string({
            description: 'Create github organization package',
            exclusive: ['gh-user']
        }),
        'gh-user': flags.string({
            description: 'Create github individual package',
            exclusive: ['gh-org']
        }),

        // render
        data: flags.string({
            description: 'According to what file to render',
            default: 'master.json'
        })
    }

    static args = [
        {
            name: 'action',
            required: true,
            options: [
                'new', 'n',
                'render', 'r',
                'update', 'u'
            ]
        },
        {
            name: 'name'
        }
    ]

    async run() {
        const { args, flags } = this.parse(Package);

        switch (args.action) {
            case 'new':
            case 'n':
                await this.new(args, flags);
                break;
            case 'render':
            case 'r':
                await this.render(args, flags);
                break;
            case 'update':
            case 'u':
                await this.update(args, flags);
                break;
        }
    }

    async new(args: any, flags: any) {
        // check args.name
        if (!args.name) {
            throw new Error('Package name is required');
        }

        // check github cli installed
        try {
            await execa('gh');
        } catch {
            throw new Error(`Require dependency of command "gh", please install Github CLI\n https://cli.github.com/`);
        }

        // questions part 1 - package basic info and github info
        const part1Questions = [];
        if (!flags.model) {
            part1Questions.push({
                type: 'list',
                name: 'model',
                message: `Choose your package model`,
                choices: [
                    {
                        name: 'standard',
                        value: 'standard',
                    },
                    {
                        name: 'util (utility, function, etc.)',
                        value: 'util',
                    },
                    {
                        name: 'class (toolchain, engine, etc.)',
                        value: 'class',
                    },
                    {
                        name: 'css (style, theme, color, etc.)',
                        value: 'css',
                    },
                ],
            });
        }
        if (!flags['gh-org'] && !flags['gh-user']) {
            part1Questions.push({
                type: 'list',
                name: 'kind',
                message: `Your package belong to`,
                choices: ['organization', 'individual'],
            });
            part1Questions.push({
                type: 'input',
                name: 'org',
                message: 'organization name',
                default: 'master-style',
                when(answers) {
                    return answers.kind == 'organization';
                },
            });
            part1Questions.push({
                type: 'input',
                name: 'user',
                message: 'username',
                when(answers) {
                    return answers.kind == 'individual';
                },
            });
        }

        const part1Answers: any = await prompt(part1Questions);

        // questions part 1 summary
        const model = part1Answers.model ? part1Answers.model : flags.model;
        const branch = (model === 'standard' || model === 'css') ? model : 'js'; // 若 model 為 'standard'、'css'，則 branch = model；若 model 為 'js'、'class'，則 branch = 'js'
        const kind = part1Answers.kind ? part1Answers.kind : (flags['gh-user'] ? 'individual' : 'organization');
        const githubName = part1Answers.user ? part1Answers.user : (part1Answers.org ? part1Answers.org : (flags['gh-user'] ? flags['gh-user'] : flags['gh-org']));
        if (model === 'util' || model === 'css') {
            args.name = `${args.name}.${model}`; // 為 PACKAGE_NAME 加上後綴
        }
        let defaultNpmPackageName = `@master/${args.name}`;

        // questions part 2 - npm package
        const part2Questions = [];
        part2Questions.push({
            type: 'input',
            name: 'name',
            message: 'package name',
            default: defaultNpmPackageName
        });
        part2Questions.push({
            type: 'input',
            name: 'license',
            message: 'package license',
            default: 'MIT'
        });
        part2Questions.push({
            type: 'input',
            name: 'description',
            message: 'package description'
        });
        part2Questions.push({
            type: 'input',
            name: 'author',
            message: 'package author',
            default: 'Aoyue Design LTD.'
        });
        part2Questions.push({
            type: 'input',
            name: 'funding',
            message: 'package funding',
            default: 'https://opencollective.com/master-style'
        });
        const part2Answers: any = await prompt(part2Questions);

        // questions part 2 summary
        const packageJson = {
            name: part2Answers.name,
            description: part2Answers.description,
            author: part2Answers.author,
            funding: part2Answers.funding,
            license: part2Answers.license,
            main: branch === 'css' ? 'index.css' : 'index.js',
            private: false,
            repository: {
                type: "git",
                url: `https://github.com/${githubName}/${args.name}.git`
            }
        }
        if (branch === 'js') {
            packageJson['types'] = 'index.d.ts';
        }

        // path
        const newPackagePath = path.join(process.cwd(), args.name);
        const configFilePath = path.join(process.cwd(), args.name, 'master.json');
        const srcPackageJsonPath = path.join(process.cwd(), args.name, 'src', 'package.json');

        const tasks = new Listr([
            // Clone package
            {
                title: 'Clone package',
                task: async () => {
                    await execa('git', ['clone', '-b', branch, 'https://github.com/master-style/package.git', args.name]);
                }
            },
            // Reset package remote
            {
                title: 'Reset cloned to package origin',
                task: () => {
                    return new Listr([
                        // Remote remove origin
                        {
                            title: 'Remote remove origin',
                            task: async (_, task) => {
                                try {
                                    await execa('git', ['remote', 'remove', 'origin'], { cwd: newPackagePath });
                                } catch (ex) {
                                    task.skip(ex.message);
                                }
                            }
                        },
                        // Remote add package
                        {
                            title: 'Remote add package',
                            task: async (_, task) => {
                                try {
                                    await execa('git', ['remote', 'add', 'package', 'https://github.com/master-style/package.git'], { cwd: newPackagePath });
                                } catch (ex) {
                                    task.skip(ex.message);
                                }
                            }
                        }
                    ]);
                }
            },
            // Init package info files
            {
                title: 'Init package info files',
                task: () => {
                    return new Listr([
                        // Checkout to main
                        {
                            title: 'Checkout to main',
                            task: async () => {
                                await execa('git', ['checkout', '-b', 'main'], { cwd: newPackagePath });
                            }
                        },
                        // Create src/package.json
                        {
                            title: 'Create src/package.json',
                            task: () => writeJson(srcPackageJsonPath, packageJson)
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: async () => {
                                await execa('git', ['add', 'src/package.json'], { cwd: newPackagePath });
                            }
                        },
                        // Update master.json
                        {
                            title: 'Update master.json',
                            task: async () => {
                                const config = await readJson(configFilePath);
                                config.name = args.name;
                                config.github = {
                                    name: githubName
                                };
                                await writeJson(configFilePath, config);
                            }
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: async () => {
                                await execa('git', ['add', 'master.json'], { cwd: newPackagePath });
                            }
                        },
                        // Update README.md
                        {
                            title: 'Update README.md',
                            task: async () => {
                                await execa('m', ['p', 'r'], { cwd: newPackagePath });
                            }
                        },
                        // Git add
                        {
                            title: 'Git add',
                            task: async () => {
                                await execa('git', ['add', 'README.md'], { cwd: newPackagePath });
                            }
                        },
                        // Git commit
                        {
                            title: 'Git commit',
                            task: async () => {
                                await execa('git', ['commit', '-m', 'Init package info files'], { cwd: newPackagePath });
                            }
                        }
                    ]);
                }
            },
            // Create github repository with GitHub CLI
            {
                title: 'Create github repository with GitHub CLI',
                task: () => {
                    return new Listr([
                        // Check auth status
                        {
                            title: 'Check auth status',
                            task: async (ctx, task) => {
                                try {
                                    await execa('gh', ['auth', 'status']);
                                    ctx.ghLogin = true;
                                } catch (ex) {
                                    if (ex.exitCode === 1) {
                                        ctx.ghLogin = false;
                                        task.skip(ex.message);
                                    }
                                }
                            }
                        },
                        // Login
                        {
                            title: 'Login',
                            enabled: ctx => ctx.ghLogin === false,
                            task: async (ctx, task) => {
                                const checkAndPrintCode = (data) => {
                                    const match = data.toString().match(/[A-Z0-9]{4}-[A-Z0-9]{4}/g);
                                    if (match && match.length > 0) {
                                        task.output = `Your one-time code: ${match.pop()}`;
                                    }
                                }
                                try {
                                    const child = execa('gh', ['auth', 'login', '-w']);
                                    child.stdout.on('data', checkAndPrintCode);
                                    child.stderr.on('data', checkAndPrintCode);
                                    child.stdin.end();
                                    await child;
                                } catch (ex) {
                                    ctx.ghLogin = false;
                                    throw new Error(ex.message);
                                }

                                ctx.ghLogin = true;
                            }
                        },
                        // Create repository
                        {
                            title: 'Create repository',
                            task: async (ctx, task) => {
                                try {
                                    if (kind === 'individual') {
                                        await execa('gh', ['repo', 'create', args.name, '--public']);
                                    } else {
                                        await execa('gh', ['repo', 'create', `${githubName}/${args.name}`, '--public']);
                                    }
                                    ctx.ghRepoCreated = true;
                                } catch (ex) {
                                    ctx.ghRepoCreated = false;
                                    task.skip(ex.message);
                                }
                            }
                        },
                        // Remote add origin
                        {
                            title: 'Remote add origin',
                            skip: ctx => ctx.ghRepoCreated !== true,
                            task: async (ctx, task) => {
                                try {
                                    await execa('git', ['remote', 'add', 'origin', `https://github.com/${githubName}/${args.name}.git`], { cwd: newPackagePath });
                                    ctx.remoteAdded = true;
                                } catch (ex) {
                                    ctx.remoteAdded = false;
                                    task.skip(ex.message);
                                }
                            }
                        }
                    ]);
                }
            },
            // Push new package to github repository
            {
                title: 'Push new package to github repository',
                task: async (_, task) => {
                    try {
                        await execa('git', ['push', 'origin', 'main'], { cwd: newPackagePath });
                    } catch (ex) {
                        task.skip(`git push failed, please try again manually.`);
                    }
                }
            }
        ]);

        await tasks.run();
    }

    async render(args: any, flags: any) {
        // check data file ext
        const dataFileExt = path.extname(flags.data);
        if (dataFileExt !== '.js' && dataFileExt !== '.json') {
            throw new Error('Only support ".js" and ".json" files');
        }

        // check target file
        if (!args.name) {
            args.name = 'README.md';
        }

        // load target file
        const targetFilePath = path.join(process.cwd(), args.name);
        const targetFileStr = await fs.readFile(targetFilePath, 'utf8');
        const targetFileLanguage = getTextTemplateLanguage(path.extname(args.name))

        // load package.json
        const srcPackageJsonPath = path.join(process.cwd(), 'src', 'package.json');
        const packageJson = await readJson(srcPackageJsonPath);

        // load source data
        const dataFilePath = path.join(process.cwd(), flags.data);
        let dataFileStr = await fs.readFile(dataFilePath, 'utf8');
        let data: any;
        if (dataFileExt === '.js') {
            data = eval(dataFileStr);
        } else {
            data = JSON.parse(dataFileStr);
        }

        // assign package.json to data
        data.package = packageJson;

        const slotTemplate = new TextTemplate(targetFileStr, {
            behavior: 'slot',
            language: targetFileLanguage
        });
        const template = new TextTemplate(slotTemplate.render(data));
        const renderedText = template.render(data);

        await fs.writeFile(targetFilePath, renderedText);
    }

    async update(args: any, flags: any) {
        // check target package
        if (!args.name) {
            args.name = 'all';
        }

        const config = await getConfig();
        if (!config.masterRoot) {
            const rootAnswers: any = await prompt([
                {
                    type: 'input',
                    name: 'root',
                    message: 'Where is the root directory of your "master" projects?',
                    default: path.join(os.homedir(), 'master')
                }
            ]);
            config.masterRoot = rootAnswers.root;
            await saveConfig(config);
        }

        const projects = []
        if (args.name === 'all') {
            const files = await fs.readdir(config.masterRoot);
            for (const file of files) {
                const stats = await fs.stat(path.join(config.masterRoot, file));
                if (stats.isDirectory()) {
                    projects.push(file);
                }
            }
        } else {
            projects.push(args.name);
        }

        const tasks = new Listr([
            {
                title: 'Git pull',
                task: () => {
                    const pullTasks = projects.map(project => ({
                        title: project,
                            task: async (ctx, task) => {
                                try {
                                    await execa('git', ['pull'], { cwd: path.join(config.masterRoot, project) });
                                } catch (ex) {
                                    if (ex.exitCode === 1) {
                                        task.skip(ex.message);
                                    }
                                }
                            }
                    }));
                    return new Listr(pullTasks, { concurrent: true });
                }
            },
            {
                title: 'Install',
                task: () => {
                    const installTasks = projects.map(project => ({
                        title: project,
                        task: async (ctx, task) => {
                            try {
                                await execa('npm', ['i'], { cwd: path.join(config.masterRoot, project) });
                            } catch (ex) {
                                if (ex.exitCode === 1) {
                                    task.skip(ex.message);
                                }
                            }
                        }
                    }));
                    return new Listr(installTasks, { concurrent: true });
                }
            },
            {
                title: 'Build',
                task: () => {
                    const buildTasks = projects.map(project => ({
                        title: project,
                        task: async (ctx, task) => {
                            try {
                                await execa('npm', ['run', 'build'], { cwd: path.join(config.masterRoot, project) });
                            } catch (ex) {
                                if (ex.exitCode === 1) {
                                    task.skip(ex.message);
                                }
                            }
                        }
                    }));
                    return new Listr(buildTasks, { concurrent: true });
                }
            }
        ]);
        await tasks.run();
    }
}
