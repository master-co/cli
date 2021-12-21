@master/cli
===========



[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@master/cli.svg)](https://npmjs.org/package/@master/cli)
[![CircleCI](https://circleci.com/gh/master-style/cli/tree/alpha.svg?style=shield)](https://circleci.com/gh/master-style/cli/tree/alpha)
[![Downloads/week](https://img.shields.io/npm/dw/@master/cli.svg)](https://npmjs.org/package/@master/cli)
[![License](https://img.shields.io/npm/l/@master/cli.svg)](https://github.com/master-style/cli/blob/alpha/LICENSE)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @master/cli
$ m COMMAND
running command...
$ m (-v|--version|version)
@master/cli/0.0.0 win32-x64 node-v16.13.0
$ m --help [COMMAND]
USAGE
  $ m COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`m help [COMMAND]`](#m-help-command)
* [`m package ACTION [NAME]`](#m-package-action-name)

## `m help [COMMAND]`

display help for m

```
USAGE
  $ m help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.14/src/commands/help.ts)_

## `m package ACTION [NAME]`

master package

```
USAGE
  $ m package ACTION [NAME]

OPTIONS
  -m, --model=standard|css|util|class  According to which model to build the package
  --data=data                          [default: master.json] According to what file to render
  --gh-org=gh-org                      Create github organization package
  --gh-user=gh-user                    Create github personal package

ALIASES
  $ m p

EXAMPLES
  $ m package new PACKAGE_NAME
  $ m package new PACKAGE_NAME --css --org ORGANIZATION
  $ m package new PACKAGE_NAME --util --user USERNAME
  ------
  $ m package render README.md --data master.json
```

_See code: [src/commands/package.ts](https://github.com/master-style/cli/blob/v0.0.0/src/commands/package.ts)_
<!-- commandsstop -->
