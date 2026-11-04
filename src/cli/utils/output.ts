/**
 * Output utilities for CLI
 */

interface Options {
  json?: boolean
}

export function output(data: any, options: Options): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2))
  }
}

export function outputError(err: any, options: Options): void {
  if (options.json) {
    console.error(JSON.stringify({
      error: true,
      message: err instanceof Error ? err.message : String(err)
    }, null, 2))
  } else {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`)
  }
}
