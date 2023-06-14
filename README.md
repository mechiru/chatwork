# Chatwork Action

[![ci](https://github.com/mechiru/chatwork/workflows/ci/badge.svg)](https://github.com/mechiru/chatwork/actions?query=workflow:ci)
![Dependabot](https://api.dependabot.com/badges/status?host=github&repo=mechiru/chatwork)

This GitHub Action sends a message to Chatwork when an issue, comment or pull request is created or edited.

## Example workflow

```yaml
name: chatwork

on:
  discussion:
    types:
      - created
      - edited
      - answered

  discussion_comment:
    types:
      - created
      - edited

  issues:
    types:
      - opened
      - edited

  issue_comment:
    types:
      - created
      - edited

  pull_request:
    types:
      - opened
      - edited

jobs:
  notify:
    runs-on: ubuntu-latest
    timeout-minutes: 1
    steps:
      - uses: mechiru/chatwork@v2
        with:
          roomId: 123
          token: ${{ secrets.CHATWORK_API_TOKEN }}
          mapping: |
            {
              "mechiru": "[To:123]@mechiru",
              "organization/team": "[To:123]@mechiru [To:124]@suzuki",
            }
```

See [action.yml](./action.yml).

## License

This Action is distributed under the terms of the MIT license, see [LICENSE](./LICENSE) for details.

## Contribute and support

Any contributions are welcomed!
