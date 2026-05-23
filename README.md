# macawake

`macawake` switches this Mac between local power profiles. It does not enable or
disable SSH, Tailscale, or Tailscale Serve; it only controls whether macOS is
allowed to sleep.

## Commands

```sh
macawake status
macawake default
macawake light
macawake server
macawake aggressive
```

Use `--dry-run` with any mutating command to print the commands without applying
changes.

Use `--color` to force colored output, or `--no-color` to force plain output.
Colors are automatically disabled for non-TTY output, `TERM=dumb`, and
`NO_COLOR`.

## Modes

- `default`: stops the `caffeinate` LaunchAgent and restores normal automatic
  sleep on battery and AC power.
- `light`: stops the `caffeinate` LaunchAgent and enables the battery-saving
  travel profile on battery. This intentionally sacrifices sleep-time network
  availability.
- `server`: starts a persistent `caffeinate -i -m` LaunchAgent and disables
  automatic sleep, while leaving closed-lid behavior within Apple-supported
  limits.
- `aggressive`: requires AC power by default, starts `caffeinate -i -m -s`, and
  enables `pmset disablesleep 1` for a closed-lid/no-monitor availability
  attempt.
- `status`: reports the saved macawake mode and keeper state first, followed by
  the active power source, Tailscale state, SSH listener state, sleep timers, and
  listening TCP ports.

## Warning

`aggressive` is for a plugged-in, ventilated Mac on a desk. Do not use it with a
Mac in a sleeve or bag.

## Install

From this package directory:

```sh
npm install --global .
```

After publishing, install the package globally with:

```sh
npm install --global macawake
```

Then run:

```sh
macawake --help
```
