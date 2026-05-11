# Phase 0: Payload-First Security TDD
1. Data Invariants: 
  - User profiles can only be created by the verified auth user.
  - User verified status/reputation can only be updated by admins.
  - Products can only be created by users.
  - Product status can only go from available to reserved.
  - Only the seller or admin can delete a product.

2. The "Dirty Dozen" Payloads: (To be tested)
  - 1. User creation with verified=true
  - 2. User creation with wrong uid
  - 3. User update reputation
  - 4. Product create with negative price
  - 5. Product update by non-seller
  - 6. Product reserve by someone else when already reserved
  - 7. Product reserve by seller themselves
  - etc...
