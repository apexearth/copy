# @apexearth/copy

Copy files via command line or Node.js.

## Installation

### Node.js Usage

    $ npm i @apexearth/copy
    
### Command Line Usage

    $ npm i @apexearth/copy -g
    
## Usage

### Node.js Usage

    const copy = require('@apexearth/copy')
    copy({
        from,         // Source copy path.
        to,           // Destination copy path.
        recursive,    // Copy recursively.
        overwrite,    // Overwrite existing files.
        verbose,      // Verbose output.
        ignoreErrors, // Continue on errors.
    })
        .then(() => console.log('done'))
        .catch(err => console.error(err))

### Command Line Usage

    Usage: copy [options] <from> <to>
    
    Options:
      -V, --version       output the version number
      -r --recursive      Copy recursively.
      -o --overwrite      Overwrite existing.
      -v --verbose        Verbose output.
      -e --ignore-errors  Ignore errors.
      -h, --help          output usage information
