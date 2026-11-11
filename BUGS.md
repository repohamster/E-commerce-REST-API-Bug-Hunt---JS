# Exercise Behaviors

These brief scenarios describe the behavior the integration tests check without giving implementation guidance.

- **Incorrect password validation:** a login attempt with the wrong password must be rejected. This security regression is tested, but the project does not ship a password-validation vulnerability.
- **Protected-route authorization:** a request without valid authentication must not access the cart. This security regression is tested, but the project does not ship an authorization bypass.
- **Pagination:** the first requested page should contain the first matching products, while category and price filters remain applied.
- **Cart quantity updates:** changing an item's quantity should leave it at the requested quantity.
- **Stock validation:** an order requesting more units than are available should be rejected without changing inventory.
- **Order totals:** subtotal and total should account for every ordered unit at its unit price.