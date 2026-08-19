import { countActiveCustomers as repoCountActiveCustomers } from "@/features/customers/infrastructure/customer.repository";

export async function countActiveCustomers(): Promise<number> {
  return repoCountActiveCustomers();
}
