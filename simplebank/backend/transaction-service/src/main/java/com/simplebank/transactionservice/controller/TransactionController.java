package com.simplebank.transactionservice.controller;

import com.simplebank.transactionservice.model.Transaction;
import com.simplebank.transactionservice.repository.TransactionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/transactions")
@CrossOrigin(origins = "*")
public class TransactionController {

    @Autowired
    private TransactionRepository transactionRepository;

    // RestTemplate is used to communicate with the Account Microservice
    private final RestTemplate restTemplate = new RestTemplate();
    private final String ACCOUNT_SERVICE_URL = System.getenv("ACCOUNT_SERVICE_URL") != null
            ? System.getenv("ACCOUNT_SERVICE_URL")
            : "http://localhost:8082/api/accounts";

    @PostMapping("/deposit")
    public ResponseEntity<?> deposit(@RequestBody Map<String, Object> payload) {
        String accountId = (String) payload.get("accountId");
        Object amountObj = payload.get("amount");
        if (accountId == null || amountObj == null) {
            return ResponseEntity.badRequest().body("accountId and amount are required");
        }

        BigDecimal amount = new BigDecimal(amountObj.toString());
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body("Deposit amount must be positive");
        }

        try {
            // 1. Update balance in Account Service via REST call
            String updateUrl = ACCOUNT_SERVICE_URL + "/" + accountId + "/update-balance?amount=" + amount;
            restTemplate.put(updateUrl, null);

            // 2. Save transaction logs
            Transaction tx = Transaction.builder()
                    .id("tx-" + UUID.randomUUID().toString())
                    .accountId(accountId)
                    .type("DEPOSIT")
                    .amount(amount)
                    .status("SUCCESS")
                    .createdDate(LocalDateTime.now())
                    .description("Direct Deposit")
                    .build();

            Transaction savedTx = transactionRepository.save(tx);
            return new ResponseEntity<>(savedTx, HttpStatus.CREATED);

        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to complete deposit: " + e.getMessage());
        }
    }

    @PostMapping("/transfer")
    public ResponseEntity<?> transfer(@RequestBody Map<String, Object> payload) {
        String sourceAccountId = (String) payload.get("sourceAccountId");
        String receiverAccountNumber = (String) payload.get("receiverAccountNumber");
        Object amountObj = payload.get("amount");

        if (sourceAccountId == null || receiverAccountNumber == null || amountObj == null) {
            return ResponseEntity.badRequest().body("sourceAccountId, receiverAccountNumber, and amount are required");
        }

        BigDecimal amount = new BigDecimal(amountObj.toString());
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body("Transfer amount must be positive");
        }

        try {
            // 1. Retrieve Source Account from Account Microservice
            Map<?, ?> sourceAccount = restTemplate.getForObject(ACCOUNT_SERVICE_URL + "/" + sourceAccountId, Map.class);
            if (sourceAccount == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Source account not found");
            }

            BigDecimal sourceBalance = new BigDecimal(sourceAccount.get("balance").toString());
            if (sourceBalance.compareTo(amount) < 0) {
                // Log failed transaction for insufficient funds
                Transaction failedTx = Transaction.builder()
                        .id("tx-" + UUID.randomUUID().toString())
                        .accountId(sourceAccountId)
                        .type("TRANSFER_OUT")
                        .amount(amount)
                        .status("FAILED")
                        .createdDate(LocalDateTime.now())
                        .description("Failed Transfer: Insufficient balance")
                        .build();
                transactionRepository.save(failedTx);
                return ResponseEntity.badRequest().body(Map.of("message", "Insufficient balance", "tx", failedTx));
            }

            // 2. Retrieve Destination Account by Account Number from Account Microservice
            Map<?, ?> targetAccount;
            try {
                targetAccount = restTemplate.getForObject(ACCOUNT_SERVICE_URL + "/number/" + receiverAccountNumber, Map.class);
            } catch (Exception e) {
                // Log failed transaction for invalid recipient account
                Transaction failedTx = Transaction.builder()
                        .id("tx-" + UUID.randomUUID().toString())
                        .accountId(sourceAccountId)
                        .type("TRANSFER_OUT")
                        .amount(amount)
                        .status("FAILED")
                        .createdDate(LocalDateTime.now())
                        .description("Failed Transfer: Receiver account " + receiverAccountNumber + " not found")
                        .build();
                transactionRepository.save(failedTx);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Receiver account not found", "tx", failedTx));
            }

            if (targetAccount == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Receiver account not found");
            }

            String targetAccountId = (String) targetAccount.get("id");
            if (sourceAccountId.equals(targetAccountId)) {
                return ResponseEntity.badRequest().body("Cannot transfer to the same account");
            }

            // 3. Execute balance shifts in Account Microservice
            // Deduct from sender
            restTemplate.put(ACCOUNT_SERVICE_URL + "/" + sourceAccountId + "/update-balance?amount=" + amount.negate(), null);
            // Add to receiver
            restTemplate.put(ACCOUNT_SERVICE_URL + "/" + targetAccountId + "/update-balance?amount=" + amount, null);

            // 4. Save both transaction ledger entries
            LocalDateTime timestamp = LocalDateTime.now();
            
            Transaction senderTx = Transaction.builder()
                    .id("tx-" + UUID.randomUUID().toString())
                    .accountId(sourceAccountId)
                    .type("TRANSFER_OUT")
                    .amount(amount)
                    .status("SUCCESS")
                    .createdDate(timestamp)
                    .description("Transfer to " + targetAccount.get("accountNumber"))
                    .build();

            Transaction receiverTx = Transaction.builder()
                    .id("tx-" + UUID.randomUUID().toString())
                    .accountId(targetAccountId)
                    .type("TRANSFER_IN")
                    .amount(amount)
                    .status("SUCCESS")
                    .createdDate(timestamp)
                    .description("Transfer from " + sourceAccount.get("accountNumber"))
                    .build();

            transactionRepository.save(senderTx);
            transactionRepository.save(receiverTx);

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "message", "Transfer completed successfully",
                    "transaction", senderTx
            ));

        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Transfer execution failure: " + e.getMessage());
        }
    }

    @GetMapping("/{accountId}")
    public ResponseEntity<List<Transaction>> getTransactionsByAccountId(@PathVariable String accountId) {
        List<Transaction> txList = transactionRepository.findByAccountIdOrderByCreatedDateDesc(accountId);
        return ResponseEntity.ok(txList);
    }
}
