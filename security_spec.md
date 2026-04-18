# Firestore Security Specification

## Data Invariants
1. **User Role Lock**: Users cannot change their own `role` field.
2. **Submission Integrity**: Students can only create submissions for themselves and cannot modify them afterwards.
3. **Teacher Authority**: Only teachers or admins can create/modify questions and tests.
4. **ID Sanitization**: All document IDs must be valid alphanumeric strings.
5. **Time Integrity**: `createdAt` and `submittedAt` must match `request.time`.

## The "Dirty Dozen" (Attack Payloads)

1. **Self-Promotion**: Student trying to update their role to 'admin'.
2. **Shadow Field Injection**: Adding an `isAdmin: true` field to a user profile.
3. **Orphaned Test**: Creating a test with a teacherId that doesn't match the current user.
4. **Submission Spoofing**: Creating a submission with a different `studentId`.
5. **Question Plagiarism**: A student trying to update a question text.
6. **Result Tampering**: A student trying to update their submission score.
7. **Resource Exhaustion**: Sending a 1MB string as a question ID.
8. **Illegal ID Characters**: Using `/` or `..` in a document ID.
9. **Future Submission**: Setting `submittedAt` to a future date.
10. **Broad Scraping**: Attempting to list all user profiles as a student.
11. **Test Hijacking**: A teacher trying to delete another teacher's test configuration.
12. **PII Leak**: A student trying to `get` the profile of another student.

## Rule Hardening Strategy
- Use `isValidId()` for all document IDs.
- Use `isValid[Entity]()` for all writes.
- Implement `isAdmin()` and `isTeacher()` using Synchronous `get()` check.
- Use `affectedKeys().hasOnly()` for all updates.
