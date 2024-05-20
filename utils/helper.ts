import {ethers} from 'hardhat';

export const deployNew = async (contractName: string, params: any[] = [], libraries: any = {}) => {
    const C = await ethers.getContractFactory(contractName, {libraries: libraries});
    const contract = await C.deploy(...params);
    return contract;
}