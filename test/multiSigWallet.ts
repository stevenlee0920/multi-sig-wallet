import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { deployNew } from "../utils/helper";

describe("MultiSigWallet", function () {
  let wallet: Contract;
  let owner1: Signer;
  let owner2: Signer;
  let owner3: Signer;
  let nonOwner: Signer;
  const required = 2;

  beforeEach(async function () {
    [owner1, owner2, owner3, nonOwner] = await ethers.getSigners();
    wallet = await deployNew("MultiSigWallet", [ [await owner1.getAddress(), await owner2.getAddress(), await owner3.getAddress()], required]);
  });

  it("should deploy with correct parameters", async function () {
    expect(await wallet.required()).to.equal(required);
    expect(await wallet.isOwner(await owner1.getAddress())).to.be.true;
    expect(await wallet.isOwner(await owner2.getAddress())).to.be.true;
    expect(await wallet.isOwner(await owner3.getAddress())).to.be.true;
    expect(await wallet.isOwner(await nonOwner.getAddress())).to.be.false;
  });

  it("should submit a transaction", async function () {
    const tx = await wallet
      .connect(owner1)
      .submitTransaction(await owner2.getAddress(), 1000, "0x");
    const receipt = await tx.wait();
    const event = receipt.events.find((e: any) => e.event === "SubmitTransaction");
    const transactionId = event.args.transactionId;

    const transaction = await wallet.transactions(transactionId);
    expect(transaction.destination).to.equal(await owner2.getAddress());
    expect(transaction.value).to.equal(1000);
    expect(transaction.executed).to.be.false;
  });

  it("should confirm and execute a transaction", async function () {
    await owner1.sendTransaction({
      to: wallet.address,
      value: ethers.utils.parseEther("1.0"),
    });

    const tx = await wallet
      .connect(owner1)
      .submitTransaction(await owner2.getAddress(), ethers.utils.parseEther("1.0"), "0x");

    const receipt = await tx.wait();
    const event = receipt.events.find((e: any) => e.event === "SubmitTransaction");
    const transactionId = event.args.transactionId;

    await wallet.connect(owner1).confirmTransaction(transactionId);
    await wallet.connect(owner2).confirmTransaction(transactionId);

    const balanceBefore = await ethers.provider.getBalance(await owner2.getAddress());
    await wallet.connect(owner1).executeTransaction(transactionId);
    const balanceAfter = await ethers.provider.getBalance(await owner2.getAddress());

    expect(balanceAfter.sub(balanceBefore)).to.equal(ethers.utils.parseEther("1.0"));
  });

  it("should revoke confirmation", async function () {
    const tx = await wallet
      .connect(owner1)
      .submitTransaction(await owner2.getAddress(), 1000, "0x");
    const receipt = await tx.wait();
    const event = receipt.events.find((e: any) => e.event === "SubmitTransaction");
    const transactionId = event.args.transactionId;

    await wallet.connect(owner1).confirmTransaction(transactionId);
    await wallet.connect(owner2).confirmTransaction(transactionId);

    await wallet.connect(owner1).revokeConfirmation(transactionId);
    expect(await wallet.isConfirmed(transactionId)).to.be.false;
  });

  it("should fail if non-owner tries to submit a transaction", async function () {
    await expect(
      wallet
        .connect(nonOwner)
        .submitTransaction(await owner2.getAddress(), 1000, "0x")
    ).to.be.revertedWith("Not owner");
  });
});