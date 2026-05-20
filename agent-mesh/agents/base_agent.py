"""
BaseAgent — Foundation for every AgentMesh agent.

Each agent is:
  - An autonomous process with a Claude-powered brain
  - A funded wallet on Somnia that stakes, bids, and receives payments
  - An event listener that reacts to on-chain TaskPosted events (reactive pattern)
"""

import asyncio
import json
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Any, Optional

import anthropic
from anthropic.types import TextBlock
from web3 import AsyncWeb3, Web3
from web3.middleware import ExtraDataToPOAMiddleware
from dotenv import load_dotenv

load_dotenv(override=True)

logger = logging.getLogger(__name__)

# ── ABIs (minimal, for gas-efficient calls) ─────────────────────────────────

REGISTRY_ABI = json.loads("""[
  {"inputs":[{"internalType":"string","name":"name","type":"string"},
             {"internalType":"string","name":"endpoint","type":"string"},
             {"internalType":"uint8[]","name":"caps","type":"uint8[]"}],
   "name":"register","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"address","name":"wallet","type":"address"}],
   "name":"getAgent","outputs":[{"components":[
     {"internalType":"address","name":"wallet","type":"address"},
     {"internalType":"string","name":"name","type":"string"},
     {"internalType":"string","name":"endpoint","type":"string"},
     {"internalType":"uint8[]","name":"capabilities","type":"uint8[]"},
     {"internalType":"uint256","name":"stake","type":"uint256"},
     {"internalType":"uint256","name":"completedTasks","type":"uint256"},
     {"internalType":"uint256","name":"reputation","type":"uint256"},
     {"internalType":"uint8","name":"status","type":"uint8"},
     {"internalType":"uint256","name":"registeredAt","type":"uint256"}
   ],"internalType":"struct IAgentRegistry.AgentProfile","name":"","type":"tuple"}],
   "stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint8","name":"cap","type":"uint8"}],
   "name":"getAgentsByCapability","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],
   "stateMutability":"view","type":"function"},
  {"anonymous":false,"inputs":[
     {"indexed":true,"internalType":"address","name":"agent","type":"address"},
     {"indexed":false,"internalType":"string","name":"name","type":"string"},
     {"indexed":false,"internalType":"uint8[]","name":"capabilities","type":"uint8[]"}],
   "name":"AgentRegistered","type":"event"}
]""")

TASK_MARKET_ABI = json.loads("""[
  {"inputs":[{"internalType":"string","name":"title","type":"string"},
             {"internalType":"string","name":"description","type":"string"},
             {"internalType":"string","name":"inputData","type":"string"},
             {"internalType":"uint8","name":"requiredCapability","type":"uint8"},
             {"internalType":"uint256","name":"deadline","type":"uint256"},
             {"internalType":"uint8","name":"priority","type":"uint8"}],
   "name":"postTask","outputs":[{"internalType":"uint256","name":"taskId","type":"uint256"}],
   "stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"taskId","type":"uint256"}],
   "name":"submitBid","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"taskId","type":"uint256"},
             {"internalType":"address","name":"agent","type":"address"}],
   "name":"assignTask","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"taskId","type":"uint256"},
             {"internalType":"string","name":"resultHash","type":"string"}],
   "name":"submitResult","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"taskId","type":"uint256"},
             {"internalType":"uint256","name":"qualityScore","type":"uint256"}],
   "name":"verifyAndPay","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"taskId","type":"uint256"}],
   "name":"getTask","outputs":[{"components":[
     {"internalType":"uint256","name":"id","type":"uint256"},
     {"internalType":"address","name":"poster","type":"address"},
     {"internalType":"string","name":"title","type":"string"},
     {"internalType":"string","name":"description","type":"string"},
     {"internalType":"string","name":"inputData","type":"string"},
     {"internalType":"uint8","name":"requiredCapability","type":"uint8"},
     {"internalType":"uint256","name":"reward","type":"uint256"},
     {"internalType":"uint256","name":"deadline","type":"uint256"},
     {"internalType":"uint8","name":"status","type":"uint8"},
     {"internalType":"address","name":"assignedAgent","type":"address"},
     {"internalType":"address[]","name":"bidders","type":"address[]"},
     {"internalType":"string","name":"resultHash","type":"string"},
     {"internalType":"uint256","name":"qualityScore","type":"uint256"},
     {"internalType":"uint8","name":"priority","type":"uint8"},
     {"internalType":"uint256","name":"createdAt","type":"uint256"}
   ],"internalType":"struct ITaskMarket.Task","name":"","type":"tuple"}],
   "stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getOpenTasks",
   "outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],
   "stateMutability":"view","type":"function"},
  {"inputs":[],"name":"taskCount",
   "outputs":[{"internalType":"uint256","name":"","type":"uint256"}],
   "stateMutability":"view","type":"function"},
  {"anonymous":false,"inputs":[
     {"indexed":true,"internalType":"uint256","name":"taskId","type":"uint256"},
     {"indexed":true,"internalType":"address","name":"poster","type":"address"},
     {"indexed":false,"internalType":"uint256","name":"reward","type":"uint256"}],
   "name":"TaskPosted","type":"event"},
  {"anonymous":false,"inputs":[
     {"indexed":true,"internalType":"uint256","name":"taskId","type":"uint256"},
     {"indexed":true,"internalType":"address","name":"agent","type":"address"}],
   "name":"TaskAssigned","type":"event"},
  {"anonymous":false,"inputs":[
     {"indexed":true,"internalType":"uint256","name":"taskId","type":"uint256"},
     {"indexed":true,"internalType":"address","name":"agent","type":"address"},
     {"indexed":false,"internalType":"uint256","name":"qualityScore","type":"uint256"}],
   "name":"TaskCompleted","type":"event"}
]""")


class Capability(IntEnum):
    Research = 0
    CodeGen = 1
    Analysis = 2
    Verification = 3
    Orchestration = 4
    DataFetch = 5


class TaskStatus(IntEnum):
    Open = 0
    Assigned = 1
    InProgress = 2
    PendingVerification = 3
    Completed = 4
    Disputed = 5
    Cancelled = 6


@dataclass
class AgentConfig:
    name: str
    capabilities: list[Capability]
    private_key: str
    rpc_url: str = "https://dream-rpc.somnia.network"
    registry_address: str = ""
    task_market_address: str = ""
    min_stake_wei: int = int(1e15)          # 0.001 STT
    poll_interval: float = 2.0              # seconds between polls
    claude_model: str = "claude-sonnet-4-6"


class BaseAgent(ABC):
    """
    Abstract base for all AgentMesh agents.
    Provides: wallet, Somnia connection, Claude brain, event loop.
    """

    def __init__(self, config: AgentConfig):
        self.config = config
        self.log = logging.getLogger(f"agent.{config.name}")

        # Somnia connection
        self.w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(config.rpc_url))
        self.account = self.w3.eth.account.from_key(config.private_key)
        self.address = self.account.address

        # Claude client
        self.claude = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

        # Contract handles (set after addresses are known)
        self._registry: Optional[Any] = None
        self._market: Optional[Any] = None

        self._running = False
        self.stats = {"tasks_bid": 0, "tasks_completed": 0, "stt_earned_wei": 0}

    # ── Contract Setup ─────────────────────────────────────────────────────

    def setup_contracts(self, registry_addr: str, market_addr: str):
        self._registry = self.w3.eth.contract(
            address=Web3.to_checksum_address(registry_addr),
            abi=REGISTRY_ABI,
        )
        self._market = self.w3.eth.contract(
            address=Web3.to_checksum_address(market_addr),
            abi=TASK_MARKET_ABI,
        )

    # ── On-chain helpers ───────────────────────────────────────────────────

    async def _retry(self, coro_fn, max_attempts: int = 3, base_delay: float = 1.0):
        """Retry an async callable with exponential backoff."""
        last_exc: Optional[Exception] = None
        for attempt in range(max_attempts):
            try:
                return await coro_fn()
            except Exception as exc:
                last_exc = exc
                if attempt < max_attempts - 1:
                    delay = base_delay * (2 ** attempt)
                    self.log.warning(
                        f"Attempt {attempt + 1}/{max_attempts} failed: {exc}. "
                        f"Retrying in {delay:.1f}s"
                    )
                    await asyncio.sleep(delay)
        raise RuntimeError(f"All {max_attempts} attempts failed") from last_exc

    async def _send_tx(self, fn, value_wei: int = 0) -> str:
        async def _attempt():
            nonce = await self.w3.eth.get_transaction_count(self.address)
            gas_price = await self.w3.eth.gas_price
            tx = await fn.build_transaction({
                "from": self.address,
                "nonce": nonce,
                "gasPrice": gas_price,
                "value": value_wei,
            })
            signed = self.account.sign_transaction(tx)
            tx_hash = await self.w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = await self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            return receipt["transactionHash"].hex()

        return await self._retry(_attempt)

    async def register_on_chain(self):
        assert self._registry is not None, "call setup_contracts() first"
        caps = [int(c) for c in self.config.capabilities]
        fn = self._registry.functions.register(
            self.config.name, f"agent://{self.address}", caps
        )
        tx = await self._send_tx(fn, value_wei=self.config.min_stake_wei)
        self.log.info(f"Registered on-chain: {tx}")
        return tx

    async def bid_on_task(self, task_id: int) -> str:
        assert self._market is not None, "call setup_contracts() first"
        fn = self._market.functions.submitBid(task_id)
        tx = await self._send_tx(fn)
        self.stats["tasks_bid"] += 1
        self.log.info(f"Bid on task #{task_id}: {tx}")
        return tx

    async def submit_result(self, task_id: int, result_hash: str) -> str:
        assert self._market is not None, "call setup_contracts() first"
        fn = self._market.functions.submitResult(task_id, result_hash)
        tx = await self._send_tx(fn)
        self.log.info(f"Submitted result for #{task_id}: {tx}")
        return tx

    async def get_task(self, task_id: int) -> dict:
        assert self._market is not None, "call setup_contracts() first"
        raw = await self._market.functions.getTask(task_id).call()
        keys = ["id","poster","title","description","inputData","requiredCapability",
                "reward","deadline","status","assignedAgent","bidders",
                "resultHash","qualityScore","priority","createdAt"]
        return dict(zip(keys, raw))

    async def get_open_tasks(self) -> list[int]:
        assert self._market is not None, "call setup_contracts() first"
        return list(await self._market.functions.getOpenTasks().call())

    # ── Claude inference ───────────────────────────────────────────────────

    def think(self, system: str, user_msg: str, max_tokens: int = 4096) -> str:
        """Synchronous Claude call — run in executor threads to avoid blocking the loop."""
        resp = self.claude.messages.create(
            model=self.config.claude_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
        block = next((b for b in resp.content if isinstance(b, TextBlock)), None)
        return block.text if block else ""

    async def think_async(self, system: str, user_msg: str, max_tokens: int = 4096) -> str:
        """Non-blocking Claude call — runs think() in the default executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.think, system, user_msg, max_tokens)

    # ── Main loop ──────────────────────────────────────────────────────────

    async def _ensure_registered(self):
        """Register on-chain if not already registered."""
        assert self._registry is not None, "call setup_contracts() first"
        try:
            profile = await self._registry.functions.getAgent(self.address).call()
            if profile[0] == "0x0000000000000000000000000000000000000000":
                self.log.info("Not registered — registering on-chain...")
                await self.register_on_chain()
            else:
                self.log.info(f"Already registered — reputation: {profile[6]}")
        except Exception as e:
            self.log.warning(f"Registration check failed: {e}")

    async def run(self):
        """
        Reactive event loop:
          1. Auto-register on-chain if needed
          2. Subscribe to TaskPosted events on Somnia
          3. Filter tasks matching this agent's capabilities
          4. Autonomously bid and execute
        """
        assert self._market is not None, "call setup_contracts() first"
        self._running = True
        self.log.info(f"{self.config.name} starting — wallet {self.address}")
        await self._ensure_registered()
        last_block = await self.w3.eth.block_number

        while self._running:
            try:
                current_block = await self.w3.eth.block_number
                if current_block > last_block:
                    # Fetch TaskPosted events since last processed block
                    events = await self._market.events.TaskPosted.get_logs(
                        from_block=last_block + 1, to_block=current_block
                    )
                    for evt in events:
                        task_id = evt["args"]["taskId"]
                        await self._handle_new_task(task_id)
                    last_block = current_block

                # Also check assigned tasks we need to execute
                await self._check_assigned_tasks()

            except asyncio.CancelledError:
                raise
            except Exception as e:
                self.log.error(f"Loop error: {e}", exc_info=True)

            await asyncio.sleep(self.config.poll_interval)

    async def _handle_new_task(self, task_id: int):
        task = await self.get_task(task_id)
        req_cap = Capability(task["requiredCapability"])
        if req_cap in self.config.capabilities:
            if await self._should_bid(task):
                await self.bid_on_task(task_id)

    async def _check_assigned_tasks(self):
        """Check if we were assigned a task and need to execute it."""
        pass  # Overridden by subclasses that poll assigned tasks

    async def _should_bid(self, task: dict) -> bool:
        """Default: always bid if capable. Override for smarter logic."""
        return True

    @abstractmethod
    async def execute_task(self, task: dict) -> str:
        """Execute the task and return a result string."""

    def stop(self):
        self._running = False
