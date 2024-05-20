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

  it("should deploy contracts using CREATE2", async function () {
    const bytecode =
      "0x608060405234801561001057600080fd5b50610136806100206000396000f3fe6080604052600436106100295760003560e01c806360fe47b11461002e5780636d4ce63c14610051575b600080fd5b61003661005e565b60405161004391906100e5565b60405180910390f35b610059610070565b005b60005481565b60008054905090565b6100836100ab565b600080fd5b60005481565b6000819050919050565b61009f6100c9565b81146100aa57600080fd5b50565b6000813590506100bc816100dc565b92915050565b6000602082840312156100d8576100d76100d1565b5b60006100e6848285016100ad565b91505092915050565b60008115159050919050565b610106816100f1565b82525050565b600060208201905061012160008301846100fd565b92915050565b600060408201905061013c60008301846100fd565b818103602083015261014e81846100fd565b9050939250505056fea26469706673582212201f57c8d34807c9ddc5d5b2e36b5fc1566e54aa11a9dd5a5a4e2778b7bbf289a164736f6c63430008040033";
    const salt = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["some_salt_value"]));
    const contractAddress = await wallet.connect(owner1).callStatic.deployContract(bytecode, salt);

    await expect(wallet.connect(owner1).deployContract(bytecode, salt))
      .to.emit(wallet, "DeployContract")
      .withArgs(await owner1.getAddress(), contractAddress);
  });
});