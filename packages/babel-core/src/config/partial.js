// @flow

import path from "path";
import Plugin from "./plugin";
import { mergeOptions } from "./util";
import { createItemFromDescriptor } from "./item";
import { buildRootChain, type ConfigContext } from "./config-chain";
import { getEnv } from "./helpers/environment";
import { validate, type ValidatedOptions } from "./validation/options";

import type { ConfigFile, IgnoreFile } from "./files";

export default function loadPrivatePartialConfig(
  inputOpts: mixed,
): {
  options: ValidatedOptions,
  context: ConfigContext,
  ignore: IgnoreFile | void,
  babelrc: ConfigFile | void,
} | null {
  if (
    inputOpts != null &&
    (typeof inputOpts !== "object" || Array.isArray(inputOpts))
  ) {
    throw new Error("Babel options must be an object, null, or undefined");
  }

  const args = inputOpts ? validate("arguments", inputOpts) : {};

  const { envName = getEnv(), cwd = "." } = args;
  const absoluteCwd = path.resolve(cwd);

  const context: ConfigContext = {
    filename: args.filename ? path.resolve(cwd, args.filename) : null,
    cwd: absoluteCwd,
    envName,
  };

  const configChain = buildRootChain(args, context);
  if (!configChain) return null;

  const options = {};
  configChain.options.forEach(opts => {
    mergeOptions(options, opts);
  });

  // Tack the passes onto the object itself so that, if this object is
  // passed back to Babel a second time, it will be in the right structure
  // to not change behavior.
  options.babelrc = false;
  options.envName = envName;
  options.cwd = absoluteCwd;
  options.passPerPreset = false;

  options.plugins = configChain.plugins.map(descriptor =>
    createItemFromDescriptor(descriptor),
  );
  options.presets = configChain.presets.map(descriptor =>
    createItemFromDescriptor(descriptor),
  );

  return {
    options,
    context,
    ignore: configChain.ignore,
    babelrc: configChain.babelrc,
  };
}

export function loadPartialConfig(inputOpts: mixed): PartialConfig | null {
  const result = loadPrivatePartialConfig(inputOpts);
  if (!result) return null;

  const { options, babelrc, ignore } = result;

  (options.plugins || []).forEach(item => {
    if (item.value instanceof Plugin) {
      throw new Error(
        "Passing cached plugin instances is not supported in " +
          "babel.loadPartialConfig()",
      );
    }
  });

  return new PartialConfig(
    options,
    babelrc ? babelrc.filepath : undefined,
    ignore ? ignore.filepath : undefined,
  );
}

export type { PartialConfig };

class PartialConfig {
  /**
   * These properties are public, so any changes to them should be considered
   * a breaking change to Babel's API.
   */
  options: ValidatedOptions;
  babelrc: string | void;
  babelignore: string | void;

  constructor(
    options: ValidatedOptions,
    babelrc: string | void,
    ignore: string | void,
  ) {
    this.options = options;
    this.babelignore = ignore;
    this.babelrc = babelrc;

    // Freeze since this is a public API and it should be extremely obvious that
    // reassigning properties on here does nothing.
    Object.freeze(this);
  }

  /**
   * Returns true if their is a config file in the filesystem for this config.
   *
   * While this only means .babelrc(.mjs)?/package.json#babel right now, it
   * may well expand in the future, so using this is recommended vs checking
   * this.babelrc directly.
   */
  hasFilesystemConfig(): boolean {
    return this.babelrc !== undefined;
  }
}
Object.freeze(PartialConfig.prototype);
