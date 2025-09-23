# Vivafolio Ruby Runtime Library

This gem provides helper functions for creating VivafolioBlock notifications that work with the Vivafolio VS Code extension's runtime path.

## Installation

Add this line to your application's Gemfile:

```ruby
gem 'vivafolio'
```

And then execute:

```bash
bundle install
```

Or install it yourself as:

```bash
gem install vivafolio
```

## Usage

### Modern API (Recommended)

```ruby
require 'vivafolio'

# Store GUI state and create interactive blocks
picked_color = color_picker(gui_state("#ff0000"))
show_square(picked_color)
```

### Direct Module API

```ruby
require 'vivafolio'

# Using the module directly
picked_color = Vivafolio.color_picker(Vivafolio.gui_state("#ff0000"))
display_color = Vivafolio.show_square(picked_color)
```

## API Reference

### Module Methods

- `Vivafolio.gui_state(value)` - Store GUI state values and return them
- `Vivafolio.color_picker(color)` - Create an interactive color picker block
- `Vivafolio.show_square(color)` - Display a color square block
- `Vivafolio.create_entity_graph(entity_id, properties)` - Create entity graph structure
- `Vivafolio.create_block_resources(logical_name, physical_path, caching_tag)` - Create resource definitions

### Convenience Functions

- `gui_state(value)` - Same as Vivafolio.gui_state
- `color_picker(color)` - Same as Vivafolio.color_picker
- `show_square(color)` - Same as Vivafolio.show_square

## Integration with VS Code

When used in VS Code with the Vivafolio extension:

1. The functions emit JSON notifications to stdout
2. The extension captures these and creates interactive blocks
3. Users can modify values in the blocks
4. Changes sync back to the source code

## Development

After checking out the repo, run `bin/setup` to install dependencies. Then, run `rake spec` to run the tests. You can also run `bin/console` for an interactive prompt that will allow you to experiment.

To install this gem onto your local machine, run `bundle exec rake install`. To release a new version, update the version number in `version.rb`, and then run `bundle exec rake release`, which will create a git tag for the version, push git commits and tags, and push the `.gem` file to [rubygems.org](https://rubygems.org).

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/blockprotocol/vivafolio.
