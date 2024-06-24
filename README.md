# Renovate Data Exporter

A tool to export the dependency graph from [Renovate](https://docs.renovatebot.com/), while not requiring repo onboarding to Renovate, and allows a straightforward means to discover your dependency tree.

**Note** If you're currently using Renovate already, this may not be worthwhile using as-is, and instead you could use the [Renovate debug logs](https://github.com/renovatebot/renovate/issues/21455) for this, which can still be imported using [the `dmd` CLI (v0.20.0 and above)](https://gitlab.com/tanna.dev/dependency-management-data/).

## Usage

Install the package with:

```sh
# to invoke with `npm exec renovate-graph`
npm i @jamietanna/renovate-graph
# to invoke with `renovate-graph`
npm i -g @jamietanna/renovate-graph
```

### A single repository

Running the following:

```sh
renovate-graph --token $GITHUB_COM_TOKEN jamietanna/jamietanna
```

Will create the file `out/jamietanna-jamietanna.json`.

### Autodiscovery (with a filter)

Running the following:

```sh
renovate-graph --token $GITHUB_COM_TOKEN --autodiscover --autodiscover-filter 'jamietanna/*'
```

Will create the files `out/jamietanna-jamietanna`, `out/jamietanna-disARM`, etc.

### Using the `local` platform

Since Renovate 35.76.0, it's been possible to use Renovate's [local platform](https://docs.renovatebot.com/modules/platform/local/) to run Renovate against a local directory, without requiring a full Git checkout.

From a directory - possibly without a `.git` folder - you can then run:

```sh
env RG_LOCAL_PLATFORM=gitlab RG_LOCAL_ORGANISATION=jamietanna RG_LOCAL_REPO=jamietanna renovate-graph --platform local
```

This requires the following environment variables to ensure the metadata is correct:

- `RG_LOCAL_PLATFORM`: The platform that this local directory is for
- `RG_LOCAL_ORGANISATION`: The organisation that this local directory is for. Can include a `/` if a nested organisation
- `RG_LOCAL_REPO`: The repository name that this local directory is for
- `RG_EXCLUDE_REPOS`: A comma-separated list of repositories to exclude from the scanning. Must be an exact match, of the format `$org/$repo`, i.e. `jamietanna/jamietanna` or `gitlab-org/sbom/generator`

## Specifying a directory for the data

By specifying the `OUT_DIR` environment variable, we can tune where the output will go. For instance, running the following:

```sh
env OUT_DIR=../data renovate-graph --token $GITHUB_COM_TOKEN jamietanna/jamietanna
```

Will create the file `../data/jamietanna-jamietanna.json`.

## Filtering the data into SQLite

The data can be converted to an SQLite format using [the `dmd` CLI](https://gitlab.com/tanna.dev/dependency-management-data/).

### Running as a GitHub App

To simplify the means to authenticate, as well as more easily discovering repositories that you wish to retrieve data from, this has support for running as a GitHub App.

The App needs to be created with the following permissions:

- Contents: `Read only`
- Issues: `Read only`
- Metadata: `Read only`

Then, when running this, you will need to set the following environment variables:

```sh
RG_GITHUB_APP_ID='...'
RG_GITHUB_APP_KEY='-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA4XmSD...'
RENOVATE_USERNAME='renovate[bot]'
RENOVATE_GIT_AUTHOR='Renovate Bot <29139614+renovate[bot]@users.noreply.github.com>'

# may only be required if you're using this as a library, not an executable
RG_GITHUB_APP_INSTALLATION_ID='...'
```

### Additional configuration

There are also the following configuration options for further operability:

- [`RENOVATE_REQUIRE_CONFIG`](https://docs.renovatebot.com/self-hosted-configuration/#requireconfig), or by setting `requireConfig` in your `config.js` or `renovate.json`, to tune as to whether to allow a repo's custom configuration should be used. This could be used to _disable_ managers, therefore limiting the amount of data that can be retrieved by `renovate-graph`, but could also mean that custom `regexManagers` or otherwise are ignored. A value of `required` gets coerced to `ignored`.
- `RG_DELETE_CLONED_REPOS=true`: After checking the dependency data for each repo, immediately delete it. This will slow execution of renovate-graph, but will allow running when using large repositories or against a large number of repositories and organisations that could lead to exhaustion of disk space
- `RG_INCLUDE_UPDATES=true`: As well as parsing the dependency tree, also receive the list of updates that Renovate can see across your dependencies. This is opt-in as it can lead to considerably slower executions of `renovate-graph` due to needing to hit the network much higher for dependency updates.

## License

As this is heavily modified code from Renovate itself, this project is licensed in the same was as Renovate - AGPL-3.0.
