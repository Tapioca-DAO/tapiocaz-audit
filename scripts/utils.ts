import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumberish, BytesLike, ethers, Signature, Wallet } from 'ethers';
import { splitSignature } from 'ethers/lib/utils';
import { existsSync, link, readFileSync, writeFileSync } from 'fs';
import { Deployment } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import _ from 'lodash';
import SDK from 'tapioca-sdk';
import { TContract, TDeployment } from '../constants';
import {
    LZEndpointMock__factory,
    YieldBoxMock__factory,
} from '../gitsub_tapioca-sdk/src/typechain/tapioca-mocks';
import config from '../hardhat.export';
import { ERC20Permit, TapiocaOFT__factory } from '../typechain';

export const BN = (n: any) => ethers.BigNumber.from(n);
export const generateSalt = () => ethers.utils.randomBytes(32);

export const useNetwork = async (
    hre: HardhatRuntimeEnvironment,
    network: string,
) => {
    const pk = process.env.PRIVATE_KEY;
    if (pk === undefined) throw new Error('[-] PRIVATE_KEY not set');
    const info: any = config.networks?.[network];
    if (!info)
        throw new Error(`[-] Hardhat network config not found for ${network} `);

    const provider = new hre.ethers.providers.JsonRpcProvider(
        { url: info.url },
        { chainId: info.chainId, name: `rpc-${info.chainId}` },
    );

    return new hre.ethers.Wallet(pk, provider);
};

export const useUtils = (
    hre: HardhatRuntimeEnvironment,
    signer: SignerWithAddress,
) => {
    const { ethers } = hre;

    // DEPLOYMENTS
    const deployLZEndpointMock = async (chainId: number) => {
        const LZEndpointMock = new LZEndpointMock__factory(signer);
        return await LZEndpointMock.deploy(chainId);
    };

    const deployTapiocaWrapper = async () =>
        await (
            await (
                await ethers.getContractFactory('TapiocaWrapper')
            ).deploy((await ethers.getSigners())[0].address)
        ).deployed();

    const deployYieldBoxMock = async () => {
        const YieldBoxMock = new YieldBoxMock__factory(signer);
        return await YieldBoxMock.deploy();
    };

    // UTILS
    const Tx_deployTapiocaOFT = async (
        lzEndpoint: string,
        erc20Address: string,
        yieldBoxAddress: string,
        hostChainID: number,
        hostChainNetworkSigner: Wallet | SignerWithAddress,
        linked?: boolean,
    ) => {
        const erc20 = (
            await ethers.getContractAt('ERC20', erc20Address)
        ).connect(hostChainNetworkSigner);

        const erc20name = await erc20.name();
        const erc20symbol = await erc20.symbol();
        const erc20decimal = await erc20.decimals();

        const leverageModule = await (
            await ethers.getContractFactory('BaseTOFTLeverageModule')
        ).deploy(
            lzEndpoint,
            erc20Address,
            yieldBoxAddress,
            erc20name,
            erc20symbol,
            erc20decimal,
            hostChainID,
        );
        await leverageModule.deployed();

        const strategyModule = await (
            await ethers.getContractFactory('BaseTOFTStrategyModule')
        ).deploy(
            lzEndpoint,
            erc20Address,
            yieldBoxAddress,
            erc20name,
            erc20symbol,
            erc20decimal,
            hostChainID,
        );
        await strategyModule.deployed();

        const marketModule = await (
            await ethers.getContractFactory('BaseTOFTMarketModule')
        ).deploy(
            lzEndpoint,
            erc20Address,
            yieldBoxAddress,
            erc20name,
            erc20symbol,
            erc20decimal,
            hostChainID,
        );
        await marketModule.deployed();

        const optionsModule = await (
            await ethers.getContractFactory('BaseTOFTOptionsModule')
        ).deploy(
            lzEndpoint,
            erc20Address,
            yieldBoxAddress,
            erc20name,
            erc20symbol,
            erc20decimal,
            hostChainID,
        );
        await optionsModule.deployed();

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore

        const args: Parameters<TapiocaOFT__factory['deploy']> = [
            lzEndpoint,
            erc20Address,
            yieldBoxAddress,
            erc20name,
            erc20symbol,
            erc20decimal,
            hostChainID,
            leverageModule.address,
            strategyModule.address,
            marketModule.address,
            optionsModule.address,
        ];

        const txData = (
            await ethers.getContractFactory(
                linked ? 'mTapiocaOFT' : 'TapiocaOFT',
            )
        ).getDeployTransaction(...args).data as BytesLike;

        return { txData, args };
    };

    const attachTapiocaOFT = async (address: string, linked?: boolean) =>
        await ethers.getContractAt(
            linked ? 'mTapiocaOFT' : 'TapiocaOFT',
            address,
        );

    const newEOA = () =>
        new hre.ethers.Wallet(
            hre.ethers.Wallet.createRandom().privateKey,
            hre.ethers.provider,
        );

    return {
        deployYieldBoxMock,
        deployLZEndpointMock,
        deployTapiocaWrapper,
        Tx_deployTapiocaOFT,
        attachTapiocaOFT,
        newEOA,
    };
};

export const saveToJson = (data: any, filename: string, flag: 'a' | 'w') => {
    const json = JSON.stringify(data, null, 2);
    writeFileSync(filename, json, { flag });
};

export const readFromJson = (filename: string) => {
    if (existsSync(filename)) {
        const json = readFileSync(filename, 'utf8');
        return JSON.parse(json) ?? {};
    }
    return {};
};
export const readTOFTDeployments = (): TDeployment => {
    return readFromJson('deployments.json');
};

export const saveTOFTDeployment = (chainId: string, contracts: TContract[]) => {
    const deployments: TDeployment = {
        ...readFromJson('deployments.json'),
    };

    deployments[chainId] = [...(deployments[chainId] || []), ...contracts];

    saveToJson(deployments, 'deployments.json', 'w');
    return deployments;
};

export const removeTOFTDeployment = (chainId: string, contract: TContract) => {
    const deployments: TDeployment = {
        ...readFromJson('deployments.json'),
    };

    deployments[chainId] = _.remove(
        deployments[chainId],
        (e) => e?.address?.toLowerCase() != contract?.address?.toLowerCase(),
    );

    saveToJson(deployments, 'deployments.json', 'w');
    return deployments;
};

export const getContractNames = async (hre: HardhatRuntimeEnvironment) =>
    (await hre.artifacts.getArtifactPaths()).map((e) =>
        e.split('.sol')[1].replace('/', '').replace('.json', ''),
    );

export const handleGetChainBy = (
    ...params: Parameters<typeof SDK.API.utils.getChainBy>
) => {
    const chain = SDK.API.utils.getChainBy(...params);
    if (!chain) {
        throw new Error(
            `[-] Chain ${String(
                params[1],
            )} not supported in Tapioca-SDK\nSupported chains: ${JSON.stringify(
                SDK.API.utils.getSupportedChains(),
                undefined,
                2,
            )}\n\n`,
        );
    }
    return chain;
};

export const getDeploymentByChain = async (
    hre: HardhatRuntimeEnvironment,
    network: string,
    contract: string,
) => {
    if (network === hre.network.name) {
        return await hre.deployments.get(contract);
    }
    const deployment = readFromJson(
        `deployments/${network}/${contract}.json`,
    ) as Deployment;
    if (!deployment?.address)
        throw new Error(
            `[-] Deployment not found for ${contract} on ${network}`,
        );
    return deployment;
};

export const getTOFTDeploymentByERC20Address = (
    chainID: string,
    erc20Address: string,
) => {
    const toft = readTOFTDeployments()[chainID].find((e) => {
        return (
            e?.meta?.erc20?.address?.toLowerCase() ===
            erc20Address?.toLowerCase()
        );
    }) as TContract;
    if (!toft) {
        throw new Error(
            `[-] TOFT not deployed on chain ${
                handleGetChainBy('chainId', chainID).name
            }`,
        );
    }
    return toft;
};

export const getTOFTDeploymentByTOFTAddress = (
    chainID: string,
    address: string,
) => {
    const toft = readTOFTDeployments()[chainID].find(
        (e) => e.address === address,
    );
    if (!toft?.meta.hostChain.id) {
        throw new Error('[-] TOFT not deployed on host chain');
    }
    if (!toft?.meta.linkedChain.id) {
        throw new Error('[-] TOFT not deployed on linked chain');
    }

    return toft!;
};

export async function getERC20PermitSignature(
    wallet: Wallet | SignerWithAddress,
    token: ERC20Permit,
    spender: string,
    value: BigNumberish = ethers.constants.MaxUint256,
    deadline = ethers.constants.MaxUint256,
    permitConfig?: {
        nonce?: BigNumberish;
        name?: string;
        chainId?: number;
        version?: string;
    },
): Promise<Signature> {
    const [nonce, name, version, chainId] = await Promise.all([
        permitConfig?.nonce ?? token.nonces(wallet.address),
        permitConfig?.name ?? token.name(),
        permitConfig?.version ?? '1',
        permitConfig?.chainId ?? wallet.getChainId(),
    ]);

    return splitSignature(
        await wallet._signTypedData(
            {
                name,
                version,
                chainId,
                verifyingContract: token.address,
            },
            {
                Permit: [
                    {
                        name: 'owner',
                        type: 'address',
                    },
                    {
                        name: 'spender',
                        type: 'address',
                    },
                    {
                        name: 'value',
                        type: 'uint256',
                    },
                    {
                        name: 'nonce',
                        type: 'uint256',
                    },
                    {
                        name: 'deadline',
                        type: 'uint256',
                    },
                ],
            },
            {
                owner: wallet.address,
                spender,
                value,
                nonce,
                deadline,
            },
        ),
    );
}
