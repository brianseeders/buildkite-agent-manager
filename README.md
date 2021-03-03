# Elastic Jenkins PR Bot

## Overview

- Triggers PR builds in Jenkins when a PR is opened, updated via commit, or a comment is present with a customizable trigger phrase.
- Multiple repos can be configured for a single instance of the app
- Can be set to only allow PRs to be triggered by users who:
  - Are in the elastic org
  - Have a configurable level of access to the given repo (e.g. admin or write)
  - Are on a defined allowlist
- Maps a static list of branches to builds in Jenkins
- Maps any standard tracked branches (e.g. master, 7.x, etc) to a templated build ID, so the configuration doesn't need to be updated after version bumps
- Passes various bits of information from the PR to Jenkins when the build is triggered, which get set as environment variables:
  - GITHUB_PR_OWNER
  - GITHUB_PR_REPO
  - GITHUB_PR_BRANCH
  - GITHUB_PR_TRIGGERED_SHA
  - GITHUB_PR_LABELS (comma-separated list)
  - GITHUB_PR_TRIGGER_COMMENT (on comment triggers only)
- Can cancel in-progress PR builds for the given branch when a new one is triggered (configurable)
- If the commit status publisher is configured in Jenkins, the bot will post an in-progress status immediately upon triggering a build

## Getting Started

### Requirements

- Node.js 14+

### Configuration

`cp .env.template .env` and edit.

See `src/defaultConfig.js` for the default app/repo configuration.

You can create a separate config file (.js or .json) and point to it with `APP_CONFIG` in your `.env`.

### Dependencies

`npm install`

### Run it

- `npm run start` to start the app
- `npm run watch` to automatically restart on code changes
- `npm run test` or `npm run test:watch` to run tests

### Configuration

#### All job configuration options available

All parameters are optional. At least one of `allow_org_users`,
`allowed_repo_permissions`, `allowed_list` must be set for some user to be able
to trigger PRs.

**enabled**

- Enables PR integration for this job
- Values: true or false
- Default: false

**build_on_commit**

- Triggers builds on new commits. This will also trigger a build when the PR is
  created. Draft PRs will be triggered as well.
- Values: true or false
- Default: true

**build_on_comment**

- Triggers build on comments that match
  `elastic.pull_request.trigger_comment_regex` (see below).
- Values: true or false
- Default: true

**target_branch**

- Only trigger PRs that target this branch
- Value: branch name, e.g. `master`
- Default: `<empty string>`

**allow_org_users**

- Allow anyone in Elastic org to trigger this job
- Value: true or false
- Default: false

**allowed_repo_permissions**

- Comma-separated list of desired permissions. Anyone with these permissions on
  this repo can trigger this job.
- Value: `admin,write,read`
- Default: `<empty string>`

**allowed_list**

- Comma-separated list of users who are able to trigger this job
- Value: `user1,user2,user3`
- Default: `<empty string>`

**labels**

- Comma-separated list of labels required to trigger this job. Only one of the
  specified labels must be present on the PR to trigger.
- Value: `Feature:cool-feature,Team:cool-team`
- Default: `<empty string>`

Currently, if you add a new label after PR creation, you'll need to comment or
commit to the PR to trigger a job that matches that label.

**skip_ci_label**

- A label that, when present on a PR, will cause automatic triggers to be
  skipped. The build can still be triggered manually with a comment.
- Value: `my-custom-label`
- Default: `skip-ci`

**cancel_in_progress_builds_on_update**

- Cancel any in-progress builds for this PR when a new one is triggered.
- Values: true or false
- Default: false

**trigger_comment_regex**

- A regular expression for matching comments posted on the PR for triggering
  builds. Only users who match the allow parameters above can trigger builds via
  comment.
- Value:
  [JavaScript-style](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
  regex
- Default: `(?:(?:jenkins\W+)?(?:build | test)\W+(?:this | it)) | ^retest$`

The other general requirements must also be satisfied for the build to trigger.
For example, if a certain label is required, sending the trigger phrase will
only trigger this build if the PR also contains that label. This lets you create
a general CI pipeline with some dynamic steps based on labels, but still have
that pipeline re-run if you comment with the trigger phrase.

If you'd also like to specify a second comment that will always trigger the
build, e.g. even if the labels don't match, see
`always_trigger_comment_regex` below.

Only the first line of the comment is considered when checking for the trigger
phrase.

If you add capture groups to your expression, the captured values will be passed
to your build as environment variables and build configuration parameters.

Example:

Given the regular expression:
`jenkins deploy (?<product>[a-z]+) to (?<location>[a-z]+)`

and the comment: `jenkins deploy myapp to production`

Then, `env.GITHUB_PR_COMMENT_VAR_PRODUCT` and
`env.GITHUB_PR_COMMENT_VAR_LOCATION` will be set on your build, with the values
`myapp` and `production`.

**always_trigger_comment_regex**

- A regular expression for matching comments posted on the PR for triggering
  builds. Will always trigger the build, even if other non-strict requirements
  are not satisfied (e.g. labels).
- Value:
  [JavaScript-style](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
  regex
- Default: `<empty string>`

Works like `trigger_comment_regex` above, but always
triggers the build. Certain requirements must always be satisfied, e.g. user
permissions and PR target branch.

For example, you might have a job with:

- `trigger_comment_regex` = `jenkins build this`
- `labels` = `["feature:maps"]`
- `always_trigger_comment_regex` = `jenkins run maps ci`

Jenkins will run this job only for PRs that have the label `feature:maps`, even
when you comment `jenkins build this`

However, if a user would like to run a one-off instance of the "maps" CI on a
different PR, they can still comment with `jenkins run maps ci`
