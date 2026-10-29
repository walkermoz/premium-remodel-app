export function appearsOnCustomerQuote(item: { customerVisible?: boolean }) {
  return item.customerVisible !== false;
}
