# Chatwork Action

[![ci](https://github.com/mechiru/chatwork/workflows/ci/badge.svg)](https://github.com/mechiru/chatwork/actions?query=workflow:ci)
![Dependabot](https://api.dependabot.com/badges/status?host=github&repo=mechiru/chatwork)

This GitHub Action sends a message to the chatwork when an issue or comment is created or edited.

## Example workflow

```yaml
name: chatwork

on:
  issues:
    types:
      - opened
      - edited

  issue_comment:
    types:
      - created
      - edited

jobs:
  notify:
    runs-on: ubuntu-latest
    timeout-minutes: 1
    steps:
      - uses: mechiru/chatwork@v1
        with:
          roomId: 123
          token: ${{ secrets.CHATWORK_API_TOKEN }}
          mapping: |
            {
              "mechiru": "[To:123]@mechiru"
            }
```

See [action.yml](./action.yml).

## License

This Action is distributed under the terms of the MIT license, see [LICENSE](./LICENSE) for details.

## Contribute and support

Any contributions are welcomed!
