# @apexearth/copy

[![Travis Status](https://travis-ci.org/apexearth/copy.svg?branch=master)]((https://coveralls.io/github/apexearth/copy?branch=master))
![NPM Downloads](https://img.shields.io/npm/dw/@apexearth/copy.svg?style=flat)
[![install size](https://packagephobia.now.sh/badge?p=@apexearth/copy)](https://packagephobia.now.sh/result?p=@apexearth/copy)
![License](https://img.shields.io/npm/l/@apexearth/copy.svg?style=flat)

Copy files via command line or Node.js.

## Installation

### Node.js Usage

    $ npm i @apexearth/copy
    
### Command Line Usage

    $ npm i @apexearth/copy -g
    
## Usage

### Node.js Usage

```javascript
const copy = require('@apexearth/copy')
copy({
    from,           // Source copy path.
    to,             // Destination copy path.
    recursive,      // Copy recursively.
    overwrite,      // Overwrite existing file
    verbose,        // Verbose output.
    ignoreErrors,   // Continue on errors.
    parallelJobs,   // Number of possible concurrent jobs.
    state,          // Save state for resume ability.
    stateFrequency  // Save state frequency.
})
    .then(() => console.log('done'))
    .catch(err => console.error(err))
```

### Command Line Usage

```shell
Usage: copy [options] <from> <to>

Options:
  -V, --version            output the version number
  -r, --recursive          Copy recursively.
  -o, --overwrite          Overwrite existing.
  -v, --verbose            Verbose output.
  -e, --ignore-errors      Ignore errors.
  -p, --parallel-jobs <n>  Number of possible concurrent jobs.
  -s, --state <file>       Save state to file for resume ability.
  --state-frequency <n>    Save state frequency. (In <n> files saved.)
  -h, --help               output usage information
```
