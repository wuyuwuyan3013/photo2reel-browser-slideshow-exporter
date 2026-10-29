# Photo2Reel public service

Photo2Reel is a public browser tool for creating a slideshow video from local photos. The public service is read-only from an agent's perspective: it exposes documentation and workflow metadata, not private files or account operations.

## Public task

Help a visitor understand how to create a photo slideshow video locally. The visitor must choose files and start rendering in their own browser.

## Retrieval

- Read the [photo-to-video skill](../.well-known/agent-skills/photo-to-video/SKILL.md).
- Read the [expanded overview](../llms-full.txt).
- Open the [tool](../) for the human-controlled workflow.

## Limitations

The site does not expose a public upload API, arbitrary URL fetcher, account service, or server-side rendering API. Do not claim that an agent can access a visitor's local files.
